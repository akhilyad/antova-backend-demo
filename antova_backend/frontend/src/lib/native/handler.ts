/**
 * The built-in engine's HTTP surface: the same /api routes, request bodies and JSON as the FastAPI
 * engine (antova_api.py, antova_review_api.py, antova_upload_api.py), answered inside this app.
 * The catch-all /api route calls handleNative when no BACKEND_URL is configured and an LLM is.
 */
import { createHash } from 'node:crypto';
import { after, NextResponse, type NextRequest } from 'next/server';
import sample402Raw from '../sample402.json';
import { replayResponse, SAMPLE_TENDER_IDS, type SampleBrief } from '../replay.ts';
import { REVIEW_HEADER } from '../proxy-policy.ts';
import type { ReviewRow, Tender } from '../types.ts';
import { nativeWriteToken, type EngineMode } from './config.ts';
import { probeLlm } from './llm.ts';
import { EQUIPMENT_CLASSES, RATE_TABLES } from './ontology.ts';
import { parsePdf } from './pdftext.ts';
import { getStore } from './store.ts';
import {
  ENGINE_VERSION,
  advanceJob,
  createJob,
  keys,
  publicJob,
  type FileEntry,
  type Manifest,
  type NativeJob,
} from './pipeline.ts';
import {
  briefPayload,
  clarificationsCsv,
  DEFAULT_SENSITIVITY,
  evaluateFinancials,
  evidenceHash,
  latestReviews,
  openItems,
  reviewState,
  type Sensitivity,
  type TenderState,
} from './evaluate.ts';

type Native = Extract<EngineMode, { kind: 'native' }>;

const SOURCE = { 'x-antova-source': 'live', 'x-antova-engine': 'native' };
// One step must finish inside the route's maxDuration (60 s).
const STEP_BUDGET_MS = 57_000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_BIDS = 8;
const TENDER_ID = /^[A-Za-z0-9._-]{1,64}$/;
const VENDOR_ID = /^[A-Za-z0-9._-]{1,32}$/;

function json(status: number, body: unknown, requestId: string, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...SOURCE, 'x-request-id': requestId, 'cache-control': 'no-store', ...extra } });
}

function fail(status: number, detail: string, requestId: string, code?: string) {
  return json(status, { detail, ...(code ? { code } : {}) }, requestId);
}

/** Next.js hands the catch-all route its path segments already decoded. */
function decode(segment: string): string | null {
  return segment;
}

function validFilename(name: string): boolean {
  return name.length > 0 && name.length <= 160 && !/[\\/\x00-\x1f]/.test(name) && !name.startsWith('.') && /\.pdf$/i.test(name);
}

/**
 * Writes need the reviewer token when REVIEW_TOKEN is set on the server; otherwise they are open.
 * 'missing' (no token sent) and 'invalid' (sent, but not this server's) are told apart, so a person
 * who did save a token is told it is the wrong one, not asked to add one.
 */
type TokenCheck = 'open' | 'ok' | 'missing' | 'invalid';

function tokenCheck(request: NextRequest): TokenCheck {
  const required = nativeWriteToken(process.env);
  if (!required) return 'open';
  const given = (request.headers.get(REVIEW_HEADER) || '').trim();
  if (!given) return 'missing';
  // Constant-time over the longer length, so the comparison leaks nothing about the token.
  const n = Math.max(given.length, required.length);
  let diff = given.length ^ required.length;
  for (let i = 0; i < n; i++) diff |= (given.charCodeAt(i) || 0) ^ (required.charCodeAt(i) || 0);
  return diff === 0 ? 'ok' : 'invalid';
}

function writeAllowed(request: NextRequest): boolean {
  const t = tokenCheck(request);
  return t === 'open' || t === 'ok';
}

const TOKEN_INVALID =
  "The reviewer token saved under Settings doesn't match this server's REVIEW_TOKEN. Paste it again under Settings (check for extra spaces or a browser-filled password) and save.";

/** A 401 that says whether the token was missing or wrong. 
eed names the action, e.g. "Uploading". */
function denied(request: NextRequest, need: string, requestId: string) {
  return tokenCheck(request) === 'invalid'
    ? fail(401, TOKEN_INVALID, requestId, 'token_invalid')
    : fail(401, `${need} needs your reviewer token. Add it under Settings.`, requestId, 'token_missing');
}

function reviewer(request: NextRequest): string {
  const t = (request.headers.get(REVIEW_HEADER) || '').trim();
  return t ? `reviewer-${createHash('sha256').update(t).digest('hex').slice(0, 8)}` : 'reviewer';
}

async function body<T>(request: NextRequest): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function serveSample(method: string, subPath: string, requestId: string) {
  const r = replayResponse(method, subPath, sample402Raw as SampleBrief, { reason: 'not_configured' });
  const headers = { ...r.headers, 'x-request-id': requestId };
  return typeof r.body === 'string'
    ? new NextResponse(r.body, { status: r.status, headers })
    : NextResponse.json(r.body, { status: r.status, headers });
}

function sensitivityFrom(raw: any): Sensitivity | null {
  if (!raw || typeof raw !== 'object') return DEFAULT_SENSITIVITY;
  const num = (v: unknown, d: number) => (v === undefined || v === null ? d : Number(v));
  const s = {
    copper_multiplier: num(raw.copper_multiplier, 1),
    freight_multiplier: num(raw.freight_multiplier, 1),
    site_labor_rate: raw.site_labor_rate === undefined || raw.site_labor_rate === null ? null : Number(raw.site_labor_rate),
  };
  const ok = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 1e6);
  return ok(s.copper_multiplier) && ok(s.freight_multiplier) && ok(s.site_labor_rate) ? s : null;
}

// --- Health -----------------------------------------------------------------------------------

async function health(mode: Native, requestId: string) {
  const store = getStore();
  const probe = await probeLlm(mode.llm);
  const body = {
    status: probe.ok ? 'healthy' : 'degraded',
    mode: 'live',
    engine: 'native',
    version: ENGINE_VERSION,
    provider: mode.llm.provider,
    model: mode.llm.model,
    llm: probe.ok ? 'ok' : 'unreachable',
    llm_latency_ms: probe.latency_ms,
    storage: store.durable ? store.kind : 'ephemeral',
    ...(probe.ok ? {} : { detail: probe.detail }),
    ...(mode.ignoredBackend ? { ignored_backend_url: mode.ignoredBackend } : {}),
  };
  return json(probe.ok ? 200 : 503, body, requestId);
}

// --- Files and manifest -------------------------------------------------------------------------

async function putFile(request: NextRequest, tenderId: string, filename: string, requestId: string) {
  if (SAMPLE_TENDER_IDS.has(tenderId)) return fail(409, `${tenderId} is the saved sample. Use another tender ID.`, requestId);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return fail(422, 'The file is empty.', requestId);
  if (bytes.length > MAX_UPLOAD_BYTES) return fail(413, 'The PDF is larger than 50 MB.', requestId);
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') return fail(415, `${filename} is not a PDF.`, requestId);
  let parsed;
  try {
    parsed = await parsePdf(bytes);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unreadable';
    return fail(422, `${filename} could not be read as a PDF (${msg.slice(0, 160)}).`, requestId);
  }
  const store = getStore();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await store.putBytes(keys.file(tenderId, filename), bytes, 'application/pdf');
  await store.putJson(keys.pages(tenderId, filename), parsed);
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  const entry: FileEntry = {
    filename,
    size_bytes: bytes.length,
    sha256,
    pages: parsed.pages.length,
    no_text_pages: parsed.pages.filter((p) => !p.text.trim()).map((p) => p.page),
    uploaded_at: new Date().toISOString(),
  };
  index[filename] = entry;
  await store.putJson(keys.fileIndex(tenderId), index);
  return json(201, { filename, size_bytes: entry.size_bytes, sha256, pages: entry.pages }, requestId);
}

async function listFiles(tenderId: string, requestId: string) {
  const store = getStore();
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  const files = Object.values(index)
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map((f) => ({ filename: f.filename, size_bytes: f.size_bytes }));
  return json(200, { files, manifest: Boolean(manifest) }, requestId);
}

async function putManifest(request: NextRequest, tenderId: string, requestId: string) {
  if (SAMPLE_TENDER_IDS.has(tenderId)) return fail(409, `${tenderId} is the saved sample. Use another tender ID.`, requestId);
  const raw = await body<any>(request);
  if (!raw || typeof raw !== 'object') return fail(400, 'Send the manifest as JSON.', requestId);
  const equipmentClass = String(raw.equipment_class || 'mv_gis_switchgear');
  const cls = EQUIPMENT_CLASSES[equipmentClass];
  if (!cls) return fail(422, `Unknown equipment class ${equipmentClass}. Known: ${Object.keys(EQUIPMENT_CLASSES).join(', ')}.`, requestId);
  const rateTable = String(raw.rate_table || cls.defaultRateTable);
  const table = RATE_TABLES[rateTable];
  if (!table) return fail(422, `Unknown rate table ${rateTable}. Known: ${Object.keys(RATE_TABLES).join(', ')}.`, requestId);
  if ((table.equipment_class ?? 'mv_gis_switchgear') !== equipmentClass) {
    return fail(422, `Rate table ${rateTable} prices ${table.equipment_class ?? 'mv_gis_switchgear'}, not ${equipmentClass}.`, requestId);
  }
  if (raw.tender_id && raw.tender_id !== tenderId) return fail(422, 'tender_id in the manifest does not match the URL.', requestId);

  const store = getStore();
  const index = (await store.getJson<Record<string, FileEntry>>(keys.fileIndex(tenderId))) ?? {};
  const docs: Manifest['documents'] = [];
  const seenVendors = new Set<string>();
  for (const d of Array.isArray(raw.documents) ? raw.documents : []) {
    const file = String(d?.file || '');
    if (!index[file]) return fail(422, `${file || 'A document'} is listed but was not uploaded.`, requestId);
    if (d.role === 'mr_spec') {
      docs.push({ file, role: 'mr_spec' });
    } else if (d.role === 'vendor_bid') {
      const vid = String(d.vendor_id || '');
      if (!VENDOR_ID.test(vid)) return fail(422, `Vendor ID "${vid}" must be letters, digits, dots, dashes or underscores.`, requestId);
      if (seenVendors.has(vid)) return fail(422, `Vendor ID ${vid} is used twice.`, requestId);
      seenVendors.add(vid);
      docs.push({ file, role: 'vendor_bid', vendor_id: vid, vendor_name: String(d.vendor_name || vid).slice(0, 120), country: String(d.country || '').slice(0, 60) });
    } else {
      return fail(422, `Unknown document role ${String(d?.role)}.`, requestId);
    }
  }
  if (docs.filter((d) => d.role === 'mr_spec').length !== 1) return fail(422, 'The file list needs exactly one MR spec.', requestId);
  const bids = docs.filter((d) => d.role === 'vendor_bid').length;
  if (bids < 1) return fail(422, 'Add at least one bid.', requestId);
  if (bids > MAX_BIDS) return fail(422, `The built-in engine evaluates up to ${MAX_BIDS} bids per tender.`, requestId);

  const estimates: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw.engineering_estimates || {})) {
    const n = Number(v);
    if (/^[a-z0-9_]{1,40}$/.test(k) && Number.isFinite(n) && n >= 0) estimates[k] = n;
  }
  const manifest: Manifest = {
    tender_id: tenderId,
    title: String(raw.title || tenderId).slice(0, 200),
    client: String(raw.client || '').slice(0, 200),
    equipment_class: equipmentClass,
    rate_table: rateTable,
    documents: docs,
    engineering_estimates: estimates,
    synthetic: Boolean(raw.synthetic),
  };
  await store.putJson(keys.manifest(tenderId), manifest);
  return json(200, manifest, requestId);
}

// --- Jobs -------------------------------------------------------------------------------------

function sampleJob(tenderId: string) {
  const now = new Date().toISOString();
  return { job_id: `sample-${tenderId}`, status: 'COMPLETED', progress_pct: 100, stage: 'Persist', created_at: now, completed_at: now, result: null, error: null };
}

function runInBackground(jobId: string, mode: Native) {
  after(async () => {
    try {
      await advanceJob(jobId, mode.llm, STEP_BUDGET_MS);
    } catch (err) {
      console.error(JSON.stringify({ event: 'native_job_error', job_id: jobId, error: err instanceof Error ? err.message : String(err) }));
    }
  });
}

async function startIngest(request: NextRequest, mode: Native, requestId: string) {
  const raw = await body<{ tender_id?: string; mode?: string }>(request);
  const tenderId = String(raw?.tender_id || '');
  if (!TENDER_ID.test(tenderId)) return fail(422, 'tender_id is required (letters, digits, dots, dashes, underscores).', requestId);
  if (SAMPLE_TENDER_IDS.has(tenderId)) return json(200, { job_id: `sample-${tenderId}`, status: 'COMPLETED' }, requestId);
  const store = getStore();
  const manifest = await store.getJson<Manifest>(keys.manifest(tenderId));
  if (!manifest) return fail(404, `Upload the files and the file list for ${tenderId} first.`, requestId);
  const job = await createJob(store, manifest, mode.llm.model);
  runInBackground(job.job_id, mode);
  return json(200, { job_id: job.job_id, status: 'QUEUED' }, requestId);
}

async function jobStatus(jobId: string, mode: Native, requestId: string) {
  if (jobId.startsWith('sample-')) {
    const t = jobId.slice('sample-'.length);
    return SAMPLE_TENDER_IDS.has(t) ? json(200, sampleJob(t), requestId) : fail(404, 'Job not found', requestId);
  }
  const job = await getStore().getJson<NativeJob>(keys.job(jobId));
  if (!job) return fail(404, 'Job not found', requestId);
  // Each poll moves an unfinished job on, in the background, so the poll itself answers at once.
  if ((job.status === 'PENDING' || job.status === 'PROCESSING') && job.lease_until <= Date.now()) {
    runInBackground(jobId, mode);
  }
  return json(200, publicJob(job), requestId);
}

// --- Tenders ----------------------------------------------------------------------------------

async function loadState(tenderId: string): Promise<TenderState | null> {
  return getStore().getJson<TenderState>(keys.state(tenderId));
}

async function saveState(state: TenderState) {
  await getStore().putJson(keys.state(state.meta.tender_id), state);
}

async function listTenders(requestId: string) {
  const store = getStore();
  const ids = (await store.getJson<string[]>(keys.tenderIndex())) ?? [];
  const rows = [];
  for (const id of ids) {
    const state = await loadState(id);
    if (!state) continue;
    rows.push({
      tender_id: id,
      title: state.meta.title,
      status: state.meta.status,
      share_id: state.meta.share_id,
      ingested_at: state.meta.ingested_at,
      verified_at: state.meta.verified_at,
      open_items: openItems(state).length,
    });
  }
  const sample = replayResponse('GET', 'review/tenders', sample402Raw as SampleBrief).body as any[];
  return json(200, [...rows, ...sample], requestId);
}

function findCell(tender: Tender, paramId: string, vendorId: string) {
  return tender.parameters.find((p) => p.id === paramId)?.vendors[vendorId] ?? null;
}

const LOCKED = 'This brief is signed off. Reopen it before you change anything.';

async function tenderRoute(request: NextRequest, tenderId: string, rest: string[], requestId: string) {
  const method = request.method.toUpperCase();
  const sub = rest.join('/');

  if (rest[0] === 'files' && rest.length === 2 && method === 'PUT') {
    const filename = decode(rest[1]);
    if (!filename || !validFilename(filename)) return fail(422, 'Use a PDF file name without slashes.', requestId);
    if (!writeAllowed(request)) return denied(request, 'Uploading', requestId);
    return putFile(request, tenderId, filename, requestId);
  }
  if (sub === 'files' && method === 'GET') return listFiles(tenderId, requestId);
  if (sub === 'manifest' && method === 'PUT') {
    if (!writeAllowed(request)) return denied(request, 'Saving the file list', requestId);
    return putManifest(request, tenderId, requestId);
  }

  // The saved sample stays as it was saved; only its totals are recomputed (that is pure arithmetic).
  if (SAMPLE_TENDER_IDS.has(tenderId)) {
    if (sub === 'evaluate' && method === 'POST') {
      const s = sensitivityFrom(await body(request));
      if (!s) return fail(422, 'Rates must be numbers of 0 or more.', requestId);
      const brief = sample402Raw as unknown as { tender: Tender };
      return json(200, { financials: evaluateFinancials(brief.tender, s) }, requestId, { 'x-antova-source': 'replay' });
    }
    return serveSample(method, ['review', 'tenders', tenderId, ...rest].map(encodeURIComponent).join('/'), requestId);
  }

  const state = await loadState(tenderId);
  if (!state) return fail(404, `No tender ${tenderId}. Upload its files and process it first.`, requestId);

  if (sub === '' && (method === 'GET' || method === 'HEAD')) return json(200, briefPayload(state), requestId);

  if (sub === 'evaluate' && method === 'POST') {
    const s = sensitivityFrom(await body(request));
    if (!s) return fail(422, 'Rates must be numbers of 0 or more.', requestId);
    return json(200, { financials: evaluateFinancials(state.tender, s, state.overrides) }, requestId);
  }

  if (sub === 'reviews' && method === 'GET') return json(200, state.reviews, requestId);

  if (rest[0] === 'documents' && rest.length === 2 && (method === 'GET' || method === 'HEAD')) {
    const filename = decode(rest[1]);
    if (!filename || !state.documents.some((d) => d.filename === filename)) return fail(404, 'Not found', requestId);
    const bytes = await getStore().getBytes(keys.file(tenderId, filename));
    if (!bytes) return fail(404, `${filename} isn't stored any more.`, requestId);
    return new NextResponse(method === 'HEAD' ? null : Buffer.from(bytes), {
      status: 200,
      headers: {
        ...SOURCE,
        'content-type': 'application/pdf',
        'content-disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        'x-request-id': requestId,
      },
    });
  }

  if (rest[0] === 'evidence' && method === 'GET') {
    // No server-side crops: the Evidence Inspector cuts them from the PDF in the browser.
    return fail(404, 'No stored evidence image; the viewer renders the citation from the PDF.', requestId, 'no_evidence_image');
  }

  if ((sub === 'clarifications.csv' || sub === 'clarifications.xlsx') && method === 'GET') {
    const vendor = request.nextUrl.searchParams.get('vendor');
    if (vendor && !state.tender.vendors.some((v) => v.id === vendor)) return fail(404, 'Not found', requestId);
    if (sub.endsWith('.xlsx')) {
      return fail(501, 'The built-in engine writes the clarification register as CSV. Download the CSV instead.', requestId, 'xlsx_unavailable');
    }
    return new NextResponse(clarificationsCsv(state.tender, vendor), {
      status: 200,
      headers: {
        ...SOURCE,
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename=Clarifications_${tenderId}${vendor ? `_${vendor}` : ''}.csv`,
        'x-request-id': requestId,
      },
    });
  }

  if (sub === 'export-tbe.xlsx' && method === 'GET') {
    if (state.meta.status !== 'VERIFIED') return fail(409, 'Sign off the brief before you download the workbook.', requestId);
    return fail(501, 'The built-in engine does not write the TBE workbook yet. Download the clarification register (CSV) or connect the full engine with BACKEND_URL.', requestId, 'xlsx_unavailable');
  }

  // Everything below changes the tender.
  const writes = ['overrides', 'reviews', 'verify', 'withdraw'];
  if (!writes.includes(rest[0])) return fail(404, 'Not found', requestId);
  if (!writeAllowed(request)) return denied(request, 'This', requestId);

  if (rest[0] === 'overrides' && rest.length === 3 && (method === 'PUT' || method === 'DELETE')) {
    if (state.meta.status === 'VERIFIED') return fail(409, LOCKED, requestId);
    const [paramId, vendorId] = [decode(rest[1]) ?? '', decode(rest[2]) ?? ''];
    const cell = findCell(state.tender, paramId, vendorId);
    if (!cell) return fail(404, 'Not found', requestId);
    const k = `${paramId}|${vendorId}`;
    if (method === 'DELETE') {
      if (!state.overrides[k]) return fail(404, 'Not found', requestId);
      delete state.overrides[k];
    } else {
      const b = await body<{ adder_eur?: string | number; note?: string }>(request);
      const amount = Number(b?.adder_eur);
      const note = String(b?.note ?? '').trim();
      if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) return fail(422, 'The amount must be a number of 0 or more.', requestId);
      if (!note) return fail(422, 'Say why, in the note.', requestId);
      state.overrides[k] = { adder_eur: amount.toFixed(2), note: note.slice(0, 1000), evidence_hash: evidenceHash(cell), set_at: new Date().toISOString() };
    }
    await saveState(state);
    return new NextResponse(null, { status: 204, headers: { ...SOURCE, 'x-request-id': requestId } });
  }

  if (rest[0] === 'reviews' && rest.length === 3 && method === 'PUT') {
    if (state.meta.status === 'VERIFIED') return fail(409, LOCKED, requestId);
    const [paramId, vendorId] = [decode(rest[1]) ?? '', decode(rest[2]) ?? ''];
    const cell = findCell(state.tender, paramId, vendorId);
    if (!cell) return fail(404, 'Not found', requestId);
    const b = await body<{ action?: string; note?: string }>(request);
    const action = b?.action;
    if (action !== 'approve' && action !== 'override' && action !== 'reject') return fail(422, 'action must be approve, override or reject.', requestId);
    const row: ReviewRow = {
      id: (state.reviews.at(-1)?.id ?? 0) + 1,
      tender_id: tenderId,
      param_id: paramId,
      vendor_id: vendorId,
      action,
      reviewer: reviewer(request),
      note: String(b?.note ?? '').slice(0, 1000),
      evidence_hash: evidenceHash(cell),
      created_at: new Date().toISOString(),
    };
    state.reviews.push(row);
    await saveState(state);
    return json(200, { ...row, state: reviewState(cell, latestReviews(state.reviews).get(`${paramId}|${vendorId}`)) }, requestId);
  }

  if (sub === 'verify' && method === 'POST') {
    const b = await body<{ run_id?: string | null }>(request);
    const runId = (state.meta.ingest_stats as any)?.run_id;
    if (b?.run_id && b.run_id !== runId) {
      return json(409, { detail: 'This tender was processed again after you opened it. Reload it and check it before you sign off.', code: 'run_changed' }, requestId);
    }
    const items = openItems(state);
    if (items.length) return json(409, { detail: 'Resolve the open items before you sign off.', open_items: items }, requestId);
    state.meta.status = 'VERIFIED';
    state.meta.verified_at = new Date().toISOString();
    await saveState(state);
    return json(200, { share_id: state.meta.share_id, verified_at: state.meta.verified_at }, requestId);
  }

  if (sub === 'withdraw' && method === 'POST') {
    state.meta.status = 'DRAFT';
    state.meta.verified_at = null;
    await saveState(state);
    return json(200, { status: 'DRAFT' }, requestId);
  }

  return fail(405, 'Method not allowed', requestId);
}

/** Answers one /api request on the built-in engine. `segments` are the decoded path parts after /api/. */
export async function handleNative(request: NextRequest, segments: string[], mode: Native, requestId: string): Promise<NextResponse> {
  const method = request.method.toUpperCase();
  const path = segments.join('/');
  try {
    if (path === 'health' && (method === 'GET' || method === 'HEAD')) return await health(mode, requestId);
    // Settings checks a token here before relying on it. Says only required / accepted, nothing else.
    if (path === 'auth/check' && method === 'GET') {
      const t = tokenCheck(request);
      return json(200, { required: t !== 'open', valid: t === 'open' || t === 'ok', sent: t !== 'missing' }, requestId);
    }
    if (path === 'jobs/ingest' && method === 'POST') {
      if (!writeAllowed(request)) return denied(request, 'Processing', requestId);
      return await startIngest(request, mode, requestId);
    }
    if (segments[0] === 'jobs' && segments.length === 2 && method === 'GET') return await jobStatus(segments[1], mode, requestId);
    if (path === 'review/tenders' && method === 'GET') return await listTenders(requestId);
    if (segments[0] === 'review' && segments[1] === 'tenders' && segments.length >= 3) {
      const tenderId = segments[2];
      if (!TENDER_ID.test(tenderId)) return fail(422, 'Tender IDs use letters, digits, dots, dashes and underscores.', requestId);
      return await tenderRoute(request, tenderId, segments.slice(3), requestId);
    }
    return fail(404, 'Not found', requestId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ event: 'native_error', request_id: requestId, method, path: `/api/${path}`, error: message.slice(0, 300) }));
    return fail(500, 'The built-in engine hit an error. Try again.', requestId);
  }
}
