/**
 * The built-in engine's ingest: MR spec + vendor bids (PDF) → the Brief the dashboard renders.
 *
 *   Intake → Parse → Locate (one model call per document) → Check each quote is on its page →
 *   Read values (units, in code) → Check where documents disagree → Price (rate table) → Persist
 *
 * The model only finds text: what the MR requires and what each bid offers, quoted with a page.
 * Everything after that is deterministic code: every quote is looked up on its page (a quote that is
 * not there is never trusted), values and units are parsed and converted here, compliance is a check
 * against the requirement, and money comes only from the versioned rate table.
 *
 * A job runs as steps, one model call each, saved after every step. Any function invocation can run
 * the next step (see advanceJob), so no step has to fit with the others inside one 60 s function.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Citation, Extraction, Finding, Parameter, StageLogEntry, Tender, Vendor } from '../types.ts';
import type { LlmSettings } from './config.ts';
import { chatJson, type LlmUsage } from './llm.ts';
import {
  EQUIPMENT_CLASSES,
  RATE_TABLES,
  deviationClasses,
  type FieldDef,
  type ParameterDef,
  type RateTable,
} from './ontology.ts';
import { locateQuote, type PageText, type ParsedPdf, type QuoteHit } from './pdftext.ts';
import { getStore, seg, type Store } from './store.ts';
import { check, operatorSymbol, parseNumber, parseValue, plausible, type Parsed } from './values.ts';
import { briefPayload, evaluateFinancials, evidenceHash, type TenderState } from './evaluate.ts';

export const ENGINE_VERSION = '3.0.0-native';

// --- Storage keys ------------------------------------------------------------------------------

export const keys = {
  file: (t: string, f: string) => `tenders/${seg(t)}/files/${seg(f)}`,
  pages: (t: string, f: string) => `tenders/${seg(t)}/pages/${seg(f)}`,
  fileIndex: (t: string) => `tenders/${seg(t)}/files-index`,
  manifest: (t: string) => `tenders/${seg(t)}/manifest`,
  state: (t: string) => `tenders/${seg(t)}/state`,
  tenderIndex: () => 'index/tenders',
  job: (j: string) => `jobs/${seg(j)}/job`,
  out: (j: string, step: string) => `jobs/${seg(j)}/out/${seg(step)}`,
};

export interface FileEntry {
  filename: string;
  size_bytes: number;
  sha256: string;
  pages: number;
  no_text_pages: number[];
  uploaded_at: string;
}

export interface ManifestDoc {
  file: string;
  role: 'mr_spec' | 'vendor_bid';
  vendor_id?: string;
  vendor_name?: string;
  country?: string;
}

export interface Manifest {
  tender_id: string;
  title: string;
  client: string;
  equipment_class: string;
  rate_table: string;
  documents: ManifestDoc[];
  engineering_estimates: Record<string, number>; // name -> qty{X} (unit set by the rate line that reads `estimate.<name>`, e.g. {kg}, {h}, {load})
  synthetic: boolean;
}

// --- Jobs --------------------------------------------------------------------------------------

export interface NativeJob {
  job_id: string;
  tender_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress_pct: number;
  stage: string;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  steps: string[];
  next: number;
  attempts: number;
  lease_until: number;
  started_ms: number;
  stage_log: StageLogEntry[];
  usage: LlmUsage;
  model: string;
}

/** What GET /api/jobs/{id} shows: the job without its working state. */
export function publicJob(job: NativeJob) {
  return {
    job_id: job.job_id,
    status: job.status,
    progress_pct: job.progress_pct,
    stage: job.stage,
    created_at: job.created_at,
    completed_at: job.completed_at,
    result: job.result,
    error: job.error,
  };
}

export async function createJob(store: Store, manifest: Manifest, model: string): Promise<NativeJob> {
  const bids = manifest.documents.filter((d) => d.role === 'vendor_bid');
  const job: NativeJob = {
    job_id: randomBytes(12).toString('hex'),
    tender_id: manifest.tender_id,
    status: 'PENDING',
    progress_pct: 0,
    stage: 'Intake',
    created_at: new Date().toISOString(),
    completed_at: null,
    error: null,
    result: null,
    steps: ['spec', ...bids.map((b) => `bid:${b.vendor_id}`), 'assemble'],
    next: 0,
    attempts: 0,
    lease_until: 0,
    started_ms: Date.now(),
    stage_log: [{ stage: 'Intake', pct: 5, t_ms: 0 }],
    usage: { input_tokens: 0, output_tokens: 0 },
    model,
  };
  await store.putJson(keys.job(job.job_id), job);
  return job;
}

function stageFor(job: NativeJob, step: string): { stage: string; pct: number } {
  const total = job.steps.length;
  const index = job.steps.indexOf(step);
  if (step === 'spec') return { stage: 'Locate: reading the MR spec', pct: 15 };
  if (step.startsWith('bid:')) {
    const n = index; // spec is step 0, so the first bid is 1
    const bids = total - 2;
    return { stage: `Locate: reading bid ${n} of ${bids} (${step.slice(4)})`, pct: 20 + Math.round((55 * (n - 1)) / Math.max(1, bids)) };
  }
  return { stage: 'Check each quote is on its page', pct: 80 };
}

const MAX_ATTEMPTS = 3;

/**
 * Runs the job's next steps until it is finished or `budgetMs` would be exceeded. Safe to call from
 * any request: a lease keeps two invocations from running the same step at once, and a step that
 * dies with its function (timeout, crash) is retried after the lease runs out.
 */
export async function advanceJob(jobId: string, llm: LlmSettings, budgetMs: number): Promise<NativeJob | null> {
  const store = getStore();
  const deadline = Date.now() + budgetMs;
  let job = await store.getJson<NativeJob>(keys.job(jobId));
  if (!job || job.status === 'COMPLETED' || job.status === 'FAILED') return job;
  if (job.lease_until > Date.now()) return job;

  let ranModelStep = false;
  while (job.next < job.steps.length) {
    const step = job.steps[job.next];
    const isModelStep = step !== 'assemble';
    // One model call per invocation: each must have the whole timeout available.
    if (isModelStep && (ranModelStep || Date.now() + llm.timeoutMs + 3_000 > deadline)) break;

    const { stage, pct } = stageFor(job, step);
    job = {
      ...job,
      status: 'PROCESSING',
      stage,
      progress_pct: Math.max(job.progress_pct, pct),
      lease_until: Date.now() + llm.timeoutMs + 15_000,
      attempts: job.attempts + 1,
    };
    await store.putJson(keys.job(jobId), job);

    try {
      if (step === 'spec') {
        const usage = await runSpecStep(store, job, llm);
        job.usage = addUsage(job.usage, usage);
        job.stage_log.push({ stage: 'Parse', pct: 20, t_ms: Date.now() - job.started_ms });
      } else if (step.startsWith('bid:')) {
        const usage = await runBidStep(store, job, step.slice(4), llm);
        job.usage = addUsage(job.usage, usage);
      } else {
        job.stage_log.push({ stage: 'Locate', pct: 60, t_ms: Date.now() - job.started_ms });
        const result = await assemble(store, job, llm);
        job.result = result;
      }
      job = { ...job, next: job.next + 1, attempts: 0, lease_until: 0 };
      if (isModelStep) ranModelStep = true;
      if (job.next >= job.steps.length) {
        job = { ...job, status: 'COMPLETED', stage: 'Persist', progress_pct: 100, completed_at: new Date().toISOString() };
      }
      await store.putJson(keys.job(jobId), job);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(JSON.stringify({ event: 'native_step_failed', job_id: jobId, step, attempt: job.attempts, error: message.slice(0, 300) }));
      const permanent = err instanceof StepError || job.attempts >= MAX_ATTEMPTS;
      job = permanent
        ? { ...job, status: 'FAILED', error: `${stage}: ${message}`.slice(0, 500), lease_until: 0, completed_at: new Date().toISOString() }
        : { ...job, lease_until: 0 };
      await store.putJson(keys.job(jobId), job);
      return job;
    }
    if (Date.now() > deadline - 2_000) break;
  }
  return job;
}

class StepError extends Error {}

function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return { input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens };
}

// --- Document text for the model ------------------------------------------------------------

const PRICE_TERMS = [/total/i, /lump[- ]?sum/i, /price/i, /€|EUR|USD|\$|GBP|£/, /offer/i];
const MAX_DOC_CHARS = 110_000;
const MAX_PAGE_CHARS = 7_000;

/**
 * The document as "[page N]" blocks. A long document is cut to the pages that mention the
 * parameters (and prices, for a bid), plus the first pages, so one model call stays inside the
 * function's time limit. The cut is reported in the warnings.
 */
function documentText(pages: PageText[], params: ParameterDef[], withPrices: boolean): { text: string; skipped: number } {
  const block = (p: PageText) => `[page ${p.page}]\n${p.text.slice(0, MAX_PAGE_CHARS)}\n`;
  const full = pages.map(block);
  const total = full.reduce((n, b) => n + b.length, 0);
  if (total <= MAX_DOC_CHARS) return { text: full.join('\n'), skipped: 0 };

  const terms = params.flatMap((p) => p.sweepTerms).concat(withPrices ? PRICE_TERMS : []);
  const scored = pages.map((p, i) => ({
    p,
    i,
    score: (i < 2 ? 100 : 0) + terms.reduce((n, re) => n + (re.test(p.text) ? 1 : 0), 0),
  }));
  const chosen = new Set<number>();
  let used = 0;
  for (const s of [...scored].sort((a, b) => b.score - a.score || a.i - b.i)) {
    if (s.score === 0) break;
    const len = block(s.p).length;
    if (used + len > MAX_DOC_CHARS) continue;
    chosen.add(s.i);
    used += len;
  }
  const kept = pages.filter((_, i) => chosen.has(i));
  return { text: kept.map(block).join('\n'), skipped: pages.length - kept.length };
}

async function loadPages(store: Store, tenderId: string, file: string): Promise<PageText[]> {
  const parsed = await store.getJson<ParsedPdf>(keys.pages(tenderId, file));
  if (!parsed) throw new StepError(`${file} is not stored any more. Upload it again.`);
  return parsed.pages;
}

async function loadManifest(store: Store, tenderId: string): Promise<Manifest> {
  const m = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!m) throw new StepError('The file list (manifest) is missing. Upload the files again.');
  return m;
}

const SECTIONS = ['datasheet', 'drawing', 'bom', 'test_plan', 'commercial', 'compliance_table', 'cover_letter', 'general'];

function fieldLine(f: FieldDef): string {
  return `${f.name} (${f.hint})`;
}

// --- Step: the MR spec ------------------------------------------------------------------------

interface SpecAnswer {
  document_title?: string | null;
  bay_count?: { value?: number | string | null; quote?: string; page?: number | null } | null;
  parameters?: Record<string, { requirement?: string; quote?: string; page?: number; fields?: Record<string, { value?: string | null } | string | null> }>;
}

async function runSpecStep(store: Store, job: NativeJob, llm: LlmSettings): Promise<LlmUsage> {
  const manifest = await loadManifest(store, job.tender_id);
  const spec = manifest.documents.find((d) => d.role === 'mr_spec');
  if (!spec) throw new StepError('No MR spec in the file list.');
  const params = EQUIPMENT_CLASSES[manifest.equipment_class].parameters;
  const pages = await loadPages(store, job.tender_id, spec.file);
  const { text, skipped } = documentText(pages, params, false);
  if (!text.trim() || pages.every((p) => !p.text.trim())) {
    throw new StepError(`${spec.file} has no text layer (a scanned PDF?). The built-in engine reads text PDFs only.`);
  }

  const system =
    'You are a senior procurement engineer reading a buyer\'s material requisition (MR) / technical specification ' +
    'for medium-voltage gas-insulated switchgear. You report what the buyer REQUIRES for each listed parameter. ' +
    'Copy every quote character for character from the page text, from a single page, and give that page number ' +
    'from the [page N] marker above it. Never invent or infer a value that is not written. Answer with one JSON object only.';
  const user = [
    'Parameters to find:',
    ...params.map((p) => `- ${p.id} ${p.name}: ${p.locateHint}\n  fields: ${p.fields.map(fieldLine).join('; ')}`),
    '- bay_count: the number of switchgear bays / panels / feeders in the buyer\'s scope of supply.',
    '',
    'Return exactly this JSON shape:',
    '{"document_title": string|null,',
    ' "bay_count": {"value": number|null, "quote": string, "page": number|null},',
    ' "parameters": {"<PARAM id>": {"requirement": "<what the MR requires, one sentence>", "quote": "<exact text, max 300 chars>", "page": <number>,',
    '   "fields": {"<field name>": {"value": "<required value with its unit, exactly as written>" | null}}}}}',
    'Leave out a parameter the MR does not specify at all. Use null for a field the MR does not state.',
    '',
    `MR document "${spec.file}":`,
    text,
  ].join('\n');

  const { data, usage } = await chatJson(llm, system, user, 4000);
  await store.putJson(keys.out(job.job_id, 'spec'), { answer: data, skipped_pages: skipped });
  return usage;
}

// --- Step: one vendor bid ---------------------------------------------------------------------

interface BidField {
  value?: string | null;
  quote?: string | null;
  page?: number | null;
  section?: string | null;
}

interface BidAnswer {
  vendor_name?: string | null;
  cover_claim?: string | null;
  headline_price?: { amount?: string | number | null; currency?: string | null; quote?: string | null; page?: number | null } | null;
  parameters?: Record<
    string,
    {
      fields?: Record<string, BidField | string | null>;
      conflict?: { field?: string; value?: string; quote?: string; page?: number; section?: string; note?: string } | null;
      confidence?: number | string | null;
    }
  >;
}

async function runBidStep(store: Store, job: NativeJob, vendorId: string, llm: LlmSettings): Promise<LlmUsage> {
  const manifest = await loadManifest(store, job.tender_id);
  const doc = manifest.documents.find((d) => d.role === 'vendor_bid' && d.vendor_id === vendorId);
  if (!doc) throw new StepError(`No bid for ${vendorId} in the file list.`);
  const params = EQUIPMENT_CLASSES[manifest.equipment_class].parameters;
  const specOut = await store.getJson<{ answer: SpecAnswer }>(keys.out(job.job_id, 'spec'));
  const specParams = specOut?.answer?.parameters ?? {};
  const pages = await loadPages(store, job.tender_id, doc.file);
  const { text, skipped } = documentText(pages, params, true);
  if (pages.every((p) => !p.text.trim())) {
    throw new StepError(`${doc.file} has no text layer (a scanned PDF?). The built-in engine reads text PDFs only.`);
  }

  const reqLines = params.map((p) => {
    const sp = specParams[p.id];
    const fieldsTxt = p.fields
      .map((f) => {
        const raw = sp?.fields?.[f.name];
        const v = typeof raw === 'string' ? raw : raw?.value;
        return `${f.name} (${f.hint})${v ? `, MR requires ${v}` : ''}`;
      })
      .join('; ');
    return `- ${p.id} ${p.name}: ${sp?.requirement ? `MR: "${sp.requirement}". ` : ''}${p.locateHint}\n  fields: ${fieldsTxt}`;
  });

  const system =
    'You are a senior procurement engineer reading one vendor\'s bid for medium-voltage gas-insulated switchgear. ' +
    'You report what the bid OFFERS for each listed parameter, never what the buyer asked for. Copy every quote ' +
    'character for character from the page text, from a single page, with the page number from the [page N] marker. ' +
    'Prefer documentary evidence (datasheet, drawing, bill of materials, test plan, commercial terms) over claims ' +
    '(cover letter, compliance statement). Never invent a value. Answer with one JSON object only.';
  const user = [
    'Parameters and what the buyer requires:',
    ...reqLines,
    '',
    'Return exactly this JSON shape:',
    '{"vendor_name": "<bidder company name>"|null,',
    ' "cover_claim": "<the bid\'s own overall compliance statement, quoted>"|null,',
    ' "headline_price": {"amount": "<total price for the complete scope, as written>", "currency": "<ISO code, e.g. EUR>", "quote": "<exact text>", "page": <number>} | null,',
    ' "parameters": {"<PARAM id>": {',
    '    "fields": {"<field name>": {"value": "<offered value with unit, exactly as written>"|null, "quote": "<exact text, max 300 chars>"|null, "page": <number>|null, "section": "<' + SECTIONS.join('|') + '>"}},',
    '    "conflict": null | {"field": "<field name>", "value": "<the other value>", "quote": "<exact text>", "page": <number>, "section": "<section>", "note": "<how the two statements differ>"},',
    '    "confidence": <0.0-1.0>}}}',
    'Rules: value null (and no quote) when the bid does not state it. A conflict is only two different values for the same field',
    'in this bid; put the documentary one in "fields" and the other in "conflict". The headline price is the total lump-sum',
    'price for the full scope, not a unit price, option or discount.',
    '',
    `Bid document "${doc.file}":`,
    text,
  ].join('\n');

  const { data, usage } = await chatJson(llm, system, user, 6000);
  await store.putJson(keys.out(job.job_id, `bid:${vendorId}`), { answer: data, skipped_pages: skipped });
  return usage;
}

// --- Step: assemble the brief -----------------------------------------------------------------

const SECTION_LABELS: Record<string, string> = {
  cover_letter: 'Cover letter',
  compliance_table: 'Compliance table',
  datasheet: 'Datasheet',
  drawing: 'Drawing',
  bom: 'BOM',
  test_plan: 'Test plan',
  commercial: 'Commercial terms',
  general: 'General section',
  mr_spec: 'MR spec',
};
const CLAIM_SECTIONS = new Set(['cover_letter', 'compliance_table']);

function asField(raw: BidField | string | null | undefined): BidField {
  if (!raw) return {};
  if (typeof raw === 'string') return { value: raw };
  return raw;
}

function pageNo(v: unknown): number | null {
  const n = typeof v === 'number' ? v : parseNumber(String(v ?? ''));
  return n && Number.isFinite(n) ? Math.round(n) : null;
}

function citationFrom(filename: string, hit: QuoteHit, quote: string, section: string): Citation {
  return {
    filename,
    page: hit.page,
    bbox: hit.bbox,
    quote: quote.trim().slice(0, 400),
    paragraph: hit.paragraph || quote.trim(),
    section,
    match: hit.match,
    rects: hit.rects,
  };
}

function bboxText(c: Citation): string {
  return `Page ${c.page} (${SECTION_LABELS[c.section] ?? c.section}), BBox [${c.bbox.map((n) => n.toFixed(1)).join(', ')}]`;
}

/**
 * €452,000 / EUR 1.2 million / 452.000,00 € → { amount, currency }.
 * @returns amount {CCY} whole currency units (D2 float), currency ISO code; {CCY} == {EUR} only when currency === 'EUR'.
 */
export function parseMoney(amount: unknown, currencyHint: unknown, quote: unknown): { amount: number | null; currency: string | null } {
  const text = `${amount ?? ''}`;
  const context = `${text} ${quote ?? ''}`;
  let currency = typeof currencyHint === 'string' && /^[A-Za-z]{3}$/.test(currencyHint.trim()) ? currencyHint.trim().toUpperCase() : null;
  if (!currency) {
    if (/€|\bEUR\b|euro/i.test(context)) currency = 'EUR';
    else if (/\$|\bUSD\b/i.test(context)) currency = 'USD';
    else if (/£|\bGBP\b/i.test(context)) currency = 'GBP';
  }
  const m = text.match(/(\d[\d.,\s ']*)(?:\s*(million|mio\.?|m\b|k\b|thousand))?/i);
  if (!m) return { amount: null, currency };
  const digits = m[1].trim();
  // A price never has three decimals, so "452.000" groups thousands (as the Python engine reads it).
  let n = /^\d{1,3}(?:\.\d{3})+$/.test(digits.replace(/\s/g, '')) ? parseNumber(digits.replace(/\./g, '')) : parseNumber(digits);
  if (n === null) return { amount: null, currency };
  let scale = (m[2] || '').toLowerCase();
  if (!scale && quote) {
    // The model may return "1.2" while the quote says "EUR 1.2 million": take the scale word that
    // follows the same number in the quote, never one attached to a different figure.
    const esc = digits.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const q = String(quote).match(new RegExp(String.raw`(?<![\d.,])${esc}\s*(million|mio\.?|m\b|k\b|thousand)`, 'i'));
    if (q) scale = q[1].toLowerCase();
  }
  // {CCY} = {CCY/million} * 1e6  |  {CCY} = {CCY/k} * 1e3
  if (/^(million|mio|m)/.test(scale)) n *= 1_000_000;
  else if (/^(k|thousand)/.test(scale)) n *= 1_000;
  // D2{CCY} float round: Math.round(x*100)/100 (half toward +inf, binary float), not Decimal ROUND_HALF_UP as in evaluate.ts
  return { amount: Math.round(n * 100) / 100, currency };
}

const PER_UNIT = /\bper\s+(?:bay|panel|unit|cubicle|feeder|set|piece|item)\b|\beach\b|\/\s*(?:bay|panel|unit|cubicle|feeder)\b/i;

/** "per bay", "each", "/ bay"…: the figure is a unit rate, not the total (same pattern as the Python engine). */
export function perUnitBasis(text: string): string | null {
  const m = text.match(PER_UNIT);
  return m ? m[0].toLowerCase() : null;
}

interface FieldRead {
  field: FieldDef;
  stated: boolean;
  value: Parsed;
  text: string;
  citation: Citation | null;
  problem: 'quote_not_found' | 'unreadable' | 'implausible' | null;
}

function readField(field: FieldDef, raw: BidField, pages: PageText[], filename: string): FieldRead {
  const text = (raw.value ?? '').toString().trim();
  if (!text || /^(null|n\/a|not stated|none)$/i.test(text)) {
    return { field, stated: false, value: { ok: false, reason: 'not stated' }, text: '', citation: null, problem: null };
  }
  const quote = (raw.quote ?? '').toString();
  const section = SECTIONS.includes(String(raw.section)) ? String(raw.section) : 'general';
  const hit = locateQuote(pages, quote || text, pageNo(raw.page));
  if (!hit) {
    return { field, stated: true, value: parseValue(field.kind, text, field.operator), text, citation: null, problem: 'quote_not_found' };
  }
  const citation = citationFrom(filename, hit, quote || text, section);
  let value = parseValue(field.kind, text, field.operator);
  if (!value.ok) value = parseValue(field.kind, quote, field.operator);
  if (!value.ok) return { field, stated: true, value, text, citation, problem: 'unreadable' };
  if (!plausible(field, value)) return { field, stated: true, value, text, citation, problem: 'implausible' };
  return { field, stated: true, value, text, citation, problem: null };
}

interface PricingResult {
  lines: Extraction['cost_lines']; // each line: qty{X}, rate{EUR/X}, unit names X
  adder: number; // D2{EUR} (float)
  formula: string;
  status: 'PRICED' | 'UNPRICED' | 'NONE';
  unpriced: string[];
  exposure: string[];
}

function priceClasses(classes: string[], table: RateTable, quantities: Record<string, number>): PricingResult {
  const lines: Extraction['cost_lines'] = [];
  const unpriced: string[] = [];
  const exposure = classes.filter((c) => (table.exposure_classes ?? []).includes(c));
  for (const cls of classes) {
    const rateLines = table.deviation_rates[cls];
    if (!rateLines || table.unpriced_classes.includes(cls)) {
      unpriced.push(cls);
      continue;
    }
    const resolved: Extraction['cost_lines'] = [];
    let missingQty = false;
    for (const rl of rateLines) {
      // qty{X}: a literal, or a named quantity (tender.bay_count {bay}, estimate.* {X}, shortfall.days {day}, shortfall.months {month})
      const qty = /^\d+(\.\d+)?$/.test(rl.qty) ? Number(rl.qty) : quantities[rl.qty];
      if (qty === undefined || qty === null || !Number.isFinite(qty)) {
        missingQty = true;
        break;
      }
      resolved.push({
        label: rl.label,
        qty: String(qty),
        unit: rl.unit,
        rate: rl.rate,
        driver: rl.driver,
        rate_low: rl.low && rl.low !== rl.rate ? rl.low : null,
        rate_high: rl.high && rl.high !== rl.rate ? rl.high : null,
      });
    }
    if (missingQty) unpriced.push(cls);
    else lines.push(...resolved);
  }
  // D2{EUR} = round2( sum qty{X} * rate{EUR/X} ) -- float, base rate only; copper/freight multipliers {1} not applied
  // here (evaluate.ts recomputes from cost_lines with Decimal, so this float adder is used only when cost_lines is empty)
  const adder = Math.round(lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.rate), 0) * 100) / 100;
  const formula = lines
    .map((l) => `${Number(l.qty)} ${l.unit} × €${Number(l.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    .join(' + ');
  return { lines, adder, formula, status: unpriced.length ? 'UNPRICED' : 'PRICED', unpriced, exposure };
}

async function assemble(store: Store, job: NativeJob, llm: LlmSettings): Promise<Record<string, unknown>> {
  const manifest = await loadManifest(store, job.tender_id);
  const cls = EQUIPMENT_CLASSES[manifest.equipment_class];
  const table = RATE_TABLES[manifest.rate_table] ?? RATE_TABLES[cls.defaultRateTable];
  const specDoc = manifest.documents.find((d) => d.role === 'mr_spec')!;
  const bidDocs = manifest.documents.filter((d) => d.role === 'vendor_bid');
  const specPages = await loadPages(store, job.tender_id, specDoc.file);
  const specOut = await store.getJson<{ answer: SpecAnswer; skipped_pages: number }>(keys.out(job.job_id, 'spec'));
  const spec = specOut?.answer ?? {};
  const warnings: string[] = [];
  if (specOut?.skipped_pages) warnings.push(`${specDoc.file}: ${specOut.skipped_pages} pages with no parameter terms were not sent to the model.`);

  // Requirements: each field's required value, read and unit-parsed here.
  const required: Record<string, { req: Record<string, Parsed>; text: Record<string, string>; citation: Citation | null; sentence: string }> = {};
  let candidatesAccepted = 0;
  let candidatesRejected = 0;
  for (const p of cls.parameters) {
    const sp = spec.parameters?.[p.id];
    if (!sp) {
      warnings.push(`The MR does not state ${p.id} (${p.name}); it is not evaluated.`);
      continue;
    }
    const req: Record<string, Parsed> = {};
    const text: Record<string, string> = {};
    for (const f of p.fields) {
      const raw = sp.fields?.[f.name];
      const v = (typeof raw === 'string' ? raw : raw?.value) ?? '';
      const parsed = parseValue(f.kind, String(v), f.operator);
      if (parsed.ok) {
        req[f.name] = parsed;
        text[f.name] = parsed.label;
      } else if (String(v).trim()) {
        warnings.push(`${p.id} ${f.label}: the MR value "${String(v).slice(0, 60)}" could not be read; that check is skipped.`);
      }
    }
    if (!Object.keys(req).length) {
      warnings.push(`${p.id} (${p.name}): no readable required value in the MR; it is not evaluated.`);
      continue;
    }
    const hit = locateQuote(specPages, sp.quote || sp.requirement || '', pageNo(sp.page));
    if (hit) candidatesAccepted++;
    else {
      candidatesRejected++;
      warnings.push(`${p.id}: the MR quote could not be found on its page; the requirement is shown without a citation.`);
    }
    required[p.id] = {
      req,
      text,
      citation: hit ? citationFrom(specDoc.file, hit, sp.quote || sp.requirement || '', 'mr_spec') : null,
      sentence: (sp.requirement || sp.quote || '').trim(),
    };
  }
  if (!Object.keys(required).length) throw new StepError('No parameter requirement could be read from the MR spec.');

  // Quantities for rate lines: the MR's bay count and the buyer's engineering estimates.
  const quantitiesBase: Record<string, number> = {}; // name -> qty{X}; 'tender.bay_count' is {bay}
  const bay = parseNumber(String(spec.bay_count?.value ?? '')); // {bay} (float; Math.round below rounds 12.5 -> 13 {bay})
  if (bay && bay > 0 && bay < 500) {
    const bayHit = spec.bay_count?.quote ? locateQuote(specPages, spec.bay_count.quote, pageNo(spec.bay_count.page)) : null;
    if (bayHit) quantitiesBase['tender.bay_count'] = Math.round(bay);
    else warnings.push(`Bay count ${bay} could not be confirmed on its MR page; gaps priced per bay stay unpriced.`);
  } else {
    warnings.push('The MR does not state a bay count; gaps priced per bay stay unpriced.');
  }
  for (const [name, value] of Object.entries(manifest.engineering_estimates || {})) {
    if (Number.isFinite(value) && value >= 0) quantitiesBase[`estimate.${name}`] = value;
  }

  const parameters: Parameter[] = cls.parameters
    .filter((p) => required[p.id])
    .map((p) => {
      const r = required[p.id];
      return {
        id: p.id,
        category: p.category,
        name: p.name,
        mr_requirement: r.sentence || p.fields.map((f) => `${f.label} ${operatorSymbol(f.operator)} ${r.text[f.name] ?? '?'}`).join(', '),
        pint_rule: p.fields.filter((f) => r.req[f.name]).map((f) => `${f.label} ${operatorSymbol(f.operator)} ${r.text[f.name]}`).join(' AND '),
        criticality: p.criticality,
        vendors: {},
        requirement_citation: r.citation,
        checks_spec: p.fields.filter((f) => r.req[f.name]).map((f) => ({ field: f.name, label: f.label, operator: f.operator, required: r.text[f.name] })),
      };
    });
  const paramDefs = new Map(cls.parameters.map((p) => [p.id, p]));

  const vendors: Vendor[] = [];
  const noTextPages: Record<string, number[]> = {};
  let rulesEvaluated = 0;
  let deviations = 0;
  let flagsRaised = 0;
  const unpricedItems: { vendor_id: string; param_id: string; classes: string[] }[] = [];
  const findings: Finding[] = [];

  for (const doc of bidDocs) {
    const vendorId = doc.vendor_id!;
    const pages = await loadPages(store, job.tender_id, doc.file);
    const empty = pages.filter((p) => !p.text.trim()).map((p) => p.page);
    if (empty.length) noTextPages[doc.file] = empty;
    const out = await store.getJson<{ answer: BidAnswer; skipped_pages: number }>(keys.out(job.job_id, `bid:${vendorId}`));
    const bid = out?.answer ?? {};
    if (out?.skipped_pages) warnings.push(`${doc.file}: ${out.skipped_pages} pages with no parameter or price terms were not sent to the model.`);

    // Headline price: only a figure whose quote is on its page, in the rate table's currency.
    const hp = bid.headline_price;
    const money = hp ? parseMoney(hp.amount, hp.currency, hp.quote) : { amount: null, currency: null };
    const hpHit = hp?.quote ? locateQuote(pages, hp.quote, pageNo(hp.page)) : null;
    let headlineStatus = 'NOT_FOUND';
    let headline: number | null = null; // D2{EUR} total for full scope (never {EUR/bay}); only set when currency === table.currency
    const perUnit = hp ? perUnitBasis(`${hp.amount ?? ''} ${hp.quote ?? ''}`) : null;
    if (hp && money.amount && hpHit) {
      if (perUnit) {
        // A unit rate is not the contract total; it is held back, like a price with no FX rate.
        headlineStatus = 'PER_UNIT';
        warnings.push(`${doc.file}: the bid price is worded "${perUnit}", so it is a unit rate, not the total. It was not evaluated.`);
      } else if (!money.currency) headlineStatus = 'CURRENCY_UNKNOWN';
      else if (money.currency !== table.currency) headlineStatus = 'FX_MISSING';
      else {
        headlineStatus = 'PRICED';
        headline = money.amount;
      }
    } else if (hp && money.amount && !hpHit) {
      warnings.push(`${doc.file}: the price "${String(hp.amount).slice(0, 40)}" could not be found on its page, so it is not used.`);
    }

    vendors.push({
      id: vendorId,
      name: (bid.vendor_name || doc.vendor_name || vendorId).toString().slice(0, 120),
      country: doc.country || '',
      headline_price: headline,
      doc_name: `${doc.file} (${pages.length} pages)`,
      cover_claim: (bid.cover_claim || '').toString().slice(0, 400),
      badge: 'Bidder',
      headline_citation: hpHit && hp?.quote ? citationFrom(doc.file, hpHit, hp.quote, 'commercial') : null,
      headline_status: headlineStatus,
      currency: money.currency,
      headline_original: hp?.amount != null ? String(hp.amount).slice(0, 60) : null,
      fx_rate: null,
      fx_date: null,
    });

    for (const param of parameters) {
      const def = paramDefs.get(param.id)!;
      const r = required[param.id];
      const answer = bid.parameters?.[param.id] ?? {};
      const fields = def.fields.filter((f) => r.req[f.name]);
      const reads = fields.map((f) => readField(f, asField(answer.fields?.[f.name]), pages, doc.file));
      const flags: { code: string; message: string }[] = [];
      for (const rd of reads) {
        if (rd.stated && rd.citation) candidatesAccepted++;
        if (rd.problem === 'quote_not_found') {
          candidatesRejected++;
          flags.push({ code: 'QUOTE_NOT_FOUND', message: `The quote for ${rd.field.label} is not on any page of ${doc.file}. Check the bid.` });
        } else if (rd.problem === 'unreadable') {
          flags.push({ code: 'VALUE_UNREADABLE', message: `"${rd.text.slice(0, 80)}" could not be read as a ${rd.field.label} value.` });
        } else if (rd.problem === 'implausible') {
          flags.push({ code: 'IMPLAUSIBLE_VALUE', message: `${rd.field.label} "${rd.text.slice(0, 60)}" is outside the believable range for this equipment.` });
        } else if (rd.citation?.match === 'fuzzy') {
          flags.push({ code: 'QUOTE_APPROXIMATE', message: `The quote for ${rd.field.label} matches its page only approximately. Check the wording.` });
        }
      }

      const usable = reads.filter((rd) => rd.stated && !rd.problem && rd.value.ok);
      const checksRaw = usable.map((rd) => ({ rd, res: check(rd.field, r.req[rd.field.name], rd.value) }));

      // A second, different statement of the same field in this bid.
      let conflictNote: string | null = null;
      let secondary: Citation | null = null;
      const c = answer.conflict;
      if (c?.field && c.value && c.quote) {
        const cf = fields.find((f) => f.name === c.field);
        const main = checksRaw.find((x) => x.rd.field.name === c.field);
        const hit = cf ? locateQuote(pages, c.quote, pageNo(c.page)) : null;
        const cv = cf ? parseValue(cf.kind, c.value, cf.operator) : ({ ok: false, reason: '' } as Parsed);
        if (cf && main && hit && cv.ok) {
          const other = check(cf, r.req[cf.name], cv);
          if (other.offered_canonical !== main.res.offered_canonical) {
            const otherCitation = citationFrom(doc.file, hit, c.quote, SECTIONS.includes(String(c.section)) ? String(c.section) : 'general');
            secondary = otherCitation;
            conflictNote = `${c.note ? `${c.note} ` : ''}The bid also states ${cf.label} ${other.offered} (p.${hit.page}).`.trim();
            if (main.res.passed && !other.passed) {
              // The weaker statement governs until the vendor clarifies; the stronger becomes the second citation.
              secondary = main.rd.citation;
              main.res = other;
              main.rd = { ...main.rd, value: cv, citation: otherCitation };
            }
            flags.push({ code: 'CONFLICT', message: `The bid states two different ${cf.label} values. Confirm which governs.` });
          }
        }
      }

      const checks = checksRaw.map(({ rd, res }) => ({
        field: rd.field.name,
        operator: rd.field.operator,
        required: res.required,
        offered: res.offered,
        offered_canonical: res.offered_canonical,
        passed: res.passed,
        citation_ref: rd.citation ? `${rd.citation.filename}#p${rd.citation.page}` : '',
        required_basis: null,
        offered_basis: null,
        comparable: res.comparable,
        offered_equivalent: res.offered_equivalent,
      }));
      rulesEvaluated += checks.length;

      const failing = new Set(checksRaw.filter((x) => !x.res.passed).map((x) => x.rd.field.name));
      const missing = reads.filter((rd) => !rd.stated);
      const problems = reads.filter((rd) => rd.problem && rd.problem !== null);
      const scopeOnly = def.fields.every((f) => f.kind === 'scope');

      let status: Extraction['status'];
      if (problems.length) status = 'MANUAL_INSPECTION_REQUIRED';
      else if (conflictNote && failing.size) status = 'CONFLICT_DOWNGRADE';
      else if (failing.size) status = 'DEVIATION_DOWNGRADE';
      else if (missing.length) status = scopeOnly ? 'MANUAL_INSPECTION_REQUIRED' : 'OMITTED';
      else status = 'COMPLIANT';

      // Money: only for a gap, only from the rate table.
      const quantities = { ...quantitiesBase };
      for (const { rd, res } of checksRaw) {
        if (res.shortfall === null) continue;
        if (rd.field.kind === 'fat_days') quantities['shortfall.days'] = res.shortfall; // {day}
        if (rd.field.kind === 'months') quantities['shortfall.months'] = res.shortfall; // {month}
      }
      let pricing: PricingResult = { lines: [], adder: 0, formula: '', status: 'NONE', unpriced: [], exposure: [] };
      if (status === 'DEVIATION_DOWNGRADE' || status === 'CONFLICT_DOWNGRADE') {
        const offeredLabels = Object.fromEntries(checksRaw.map(({ rd, res }) => [rd.field.name, res.offered]));
        const requiredLabels = Object.fromEntries(Object.entries(r.text));
        pricing = priceClasses(deviationClasses(def, failing, offeredLabels, requiredLabels), table, quantities);
      } else if (status === 'OMITTED') {
        pricing = { lines: [], adder: 0, formula: '', status: 'UNPRICED', unpriced: [`${def.id}.not_stated`], exposure: [] };
      }
      if (pricing.exposure.length) {
        flags.push({ code: 'EXPOSURE_GAP', message: 'This gap is money at risk, not a price. Accept it or ask the vendor to change it.' });
      }
      if (pricing.status === 'UNPRICED') unpricedItems.push({ vendor_id: vendorId, param_id: def.id, classes: pricing.unpriced });

      const citations = usable.map((rd) => rd.citation).filter(Boolean) as Citation[];
      const allClaims = citations.length > 0 && citations.every((ct) => CLAIM_SECTIONS.has(ct.section));
      const evidence = status === 'COMPLIANT' ? (allClaims ? 'claim_only' : 'documentary') : null;
      if (evidence === 'claim_only') {
        flags.push({ code: 'CLAIM_ONLY', message: 'Compliance is only claimed (cover letter or compliance table), not shown in a datasheet, drawing or BOM.' });
      }
      const conf = Number(answer.confidence);
      let confidence = Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : null;
      // D2{1} = {1} * 0.85 (fuzzy-match penalty)
      if (confidence !== null && citations.some((ct) => ct.match === 'fuzzy')) confidence = Math.round(confidence * 85) / 100;
      if (confidence !== null && confidence < 0.6 && status !== 'MANUAL_INSPECTION_REQUIRED') {
        flags.push({ code: 'LOW_CONFIDENCE', message: `The model was unsure (${Math.round(confidence * 100)}%). Check the quote.` });
      }
      if (flags.length) flagsRaised++;
      if (status !== 'COMPLIANT') deviations++;

      const primary = checksRaw.find((x) => x.rd.citation)?.rd.citation ?? reads.find((rd) => rd.citation)?.citation ?? null;
      const pagesUsed = [...new Set(citations.map((ct) => ct.page))];
      const segments = reads
        .filter((rd) => rd.citation)
        .map((rd) => ({ field: rd.field.name, label: rd.field.label, text: rd.value.ok ? rd.value.label : rd.text, citation: rd.citation! }));
      const extracted = reads
        .map((rd) => (rd.stated ? (rd.value.ok ? rd.value.label : rd.text) : `${rd.field.label} not stated`))
        .join(', ');

      param.vendors[vendorId] = {
        extracted_text: extracted,
        status,
        confidence,
        bbox: primary ? bboxText(primary) : '',
        snippet: primary?.quote ?? '',
        conflict_note: conflictNote,
        cost_adder: pricing.adder,
        adder_formula: pricing.formula,
        cost_lines: pricing.lines,
        pricing_status: pricing.status,
        citation: primary,
        secondary_citation: secondary,
        checks,
        rate_table_version: table.version,
        flags,
        evidence,
        segments,
        field_citations: Object.fromEntries(segments.map((sg) => [sg.field, sg.citation])),
        assembled_from: pagesUsed.length > 1 ? `assembled from ${pagesUsed.map((p) => `p.${p}`).join(' and ')}` : null,
      };
    }
  }

  // Badges: the lowest evaluated price among fully priced vendors, and the lowest headline.
  const tender: Tender = {
    id: manifest.tender_id,
    title: manifest.title || manifest.tender_id,
    client: manifest.client || '',
    mr_doc: specDoc.file,
    pages_parsed: 0,
    latency_sec: 0,
    compute_cogs: 0,
    vendors,
    parameters,
    equipment_class: manifest.equipment_class.toUpperCase(),
    rate_table_version: table.version,
  };
  const fin = evaluateFinancials(tender, { copper_multiplier: 1, freight_multiplier: 1, site_labor_rate: null });
  const priced = fin.filter((f) => f.price_status === 'PRICED' && f.true_evaluated_price !== null);
  const bestEval = priced.sort((a, b) => a.true_evaluated_price! - b.true_evaluated_price!)[0];
  const headlines = vendors.filter((v) => v.headline_price).sort((a, b) => a.headline_price! - b.headline_price!);
  for (const v of vendors) {
    if (bestEval && v.id === bestEval.vendor_id) v.badge = 'Lowest Evaluated Price';
    else if (headlines[0] && v.id === headlines[0].id) v.badge = 'Lowest Headline Price';
  }
  if (findings.length) tender.findings = findings;

  // Documents, stats and the stored state.
  const files = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(job.tender_id))) ?? {};
  const docPages = await Promise.all(manifest.documents.map((d) => loadPages(store, job.tender_id, d.file).then((p) => p.length)));
  const pagesParsed = docPages.reduce((a, b) => a + b, 0);
  tender.pages_parsed = pagesParsed;
  // D2{s} = {ms} / 1000
  const durationS = Math.round((Date.now() - job.started_ms) / 10) / 100;
  tender.latency_sec = Math.round(durationS);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ files: manifest.documents.map((d) => files[d.file]?.sha256 ?? d.file), model: llm.model, table: table.version, cls: manifest.equipment_class }))
    .digest('hex');
  // {EUR} = sum over vendors of total_adders{EUR} (default sensitivity, overrides not applied)
  const exposed = fin.reduce((n, f) => n + (f.total_adders || 0), 0); // {EUR} float sum of D2{EUR}

  const stageLog: StageLogEntry[] = [
    ...job.stage_log,
    { stage: 'Verify citations', pct: 70, t_ms: Date.now() - job.started_ms },
    { stage: 'Read values', pct: 80, t_ms: Date.now() - job.started_ms },
    { stage: 'Resolve precedence', pct: 85, t_ms: Date.now() - job.started_ms },
    { stage: 'Price', pct: 90, t_ms: Date.now() - job.started_ms },
  ];
  const ingestStats = {
    tender_id: manifest.tender_id,
    documents: manifest.documents.length,
    pages_parsed: pagesParsed,
    sld_sheets: 0,
    candidates_accepted: candidatesAccepted,
    candidates_rejected: candidatesRejected,
    rules_evaluated: rulesEvaluated,
    deviations_found: deviations,
    exposed_risk_eur: Math.round(exposed * 100) / 100, // D2{EUR} float round
    flags_raised: flagsRaised,
    locales: {},
    no_text_pages: noTextPages,
    run_fingerprint: fingerprint,
    run_id: randomBytes(16).toString('hex'),
    unpriced_items: unpricedItems,
    warnings,
    rate_table_effective_date: table.effective_date,
    duration_s: durationS,
    ingest_mode: 'native_llm',
    synthetic: Boolean(manifest.synthetic),
    model: llm.model,
    llm_input_tokens: job.usage.input_tokens,
    llm_output_tokens: job.usage.output_tokens,
  };

  // A re-ingest keeps an override or a review only while the cell it was made on is unchanged.
  const previous = await store.getJson<TenderState>(keys.state(job.tender_id));
  const overrides: TenderState['overrides'] = {};
  const cleared: { param_id: string; vendor_id: string; adder_eur: string; note: string }[] = [];
  for (const [k, o] of Object.entries(previous?.overrides ?? {})) {
    const [pid, vid] = k.split('|');
    const cell = parameters.find((p) => p.id === pid)?.vendors[vid];
    if (cell && evidenceHash(cell) === o.evidence_hash) overrides[k] = o;
    else cleared.push({ param_id: pid, vendor_id: vid, adder_eur: o.adder_eur, note: o.note });
  }

  const state: TenderState = {
    meta: {
      tender_id: manifest.tender_id,
      title: tender.title,
      status: 'DRAFT',
      share_id: previous?.meta.share_id ?? randomBytes(6).toString('hex'),
      ingested_at: new Date().toISOString(),
      verified_at: null,
      synthetic: Boolean(manifest.synthetic),
      ingest_mode: 'native_llm',
      ingest_stats: ingestStats as any,
      stage_log: stageLog,
    },
    tender,
    documents: manifest.documents.map((d, i) => ({
      filename: d.file,
      role: d.role,
      vendor_id: d.role === 'vendor_bid' ? d.vendor_id ?? null : null,
      page_count: docPages[i],
    })),
    overrides,
    reviews: previous?.reviews ?? [],
  };
  // Fail loudly here rather than store a brief the dashboard cannot read.
  briefPayload(state);
  await store.putJson(keys.state(job.tender_id), state);
  const index = (await store.getJson<string[]>(keys.tenderIndex())) ?? [];
  if (!index.includes(job.tender_id)) await store.putJson(keys.tenderIndex(), [job.tender_id, ...index]);

  return { ...ingestStats, stage_log: stageLog, overrides_cleared: cleared };
}
