/**
 * Levelled prices, open items, review state and the brief payload, ported from the Python engine
 * (antova_engine.evaluate_vendor_financials, antova_review.open_items / review_summary /
 * brief_payload) so the built-in engine's JSON is the same contract the dashboard already renders.
 * Money is exact: decimal.js-light, whole cents, ROUND_HALF_UP.
 */
import { createHash } from 'node:crypto';
import Decimal from 'decimal.js-light';
import type {
  Brief,
  Extraction,
  IngestStats,
  OpenItem,
  ReviewRow,
  SourceDocument,
  StageLogEntry,
  Tender,
  VendorFinancials,
} from '../types.ts';

export interface Sensitivity {
  copper_multiplier: number;
  site_labor_rate?: number | null;
  freight_multiplier: number;
}

export const DEFAULT_SENSITIVITY: Sensitivity = { copper_multiplier: 1, site_labor_rate: null, freight_multiplier: 1 };

export interface StoredOverride {
  adder_eur: string;
  note: string;
  evidence_hash: string;
  set_at: string;
}

export interface TenderMeta {
  tender_id: string;
  title: string;
  status: 'DRAFT' | 'VERIFIED';
  share_id: string;
  ingested_at: string;
  verified_at: string | null;
  synthetic: boolean;
  ingest_mode: string;
  ingest_stats: IngestStats;
  stage_log: StageLogEntry[];
}

/** One tender as the built-in engine stores it. */
export interface TenderState {
  meta: TenderMeta;
  tender: Tender;
  documents: SourceDocument[];
  /** "<param_id>|<vendor_id>" → the founder's own adder. */
  overrides: Record<string, StoredOverride>;
  /** Every decision, oldest first. */
  reviews: ReviewRow[];
}

const ZERO = new Decimal(0);
const cents = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const dec = (v: unknown) => {
  try {
    return new Decimal(String(v ?? 0));
  } catch {
    return ZERO;
  }
};

function lineAmount(line: Extraction['cost_lines'][number], s: Sensitivity, bound: 'base' | 'low' | 'high'): Decimal {
  const qty = dec(line.qty);
  if (line.driver === 'labour' && s.site_labor_rate !== null && s.site_labor_rate !== undefined) {
    return qty.times(dec(s.site_labor_rate));
  }
  let rate = dec(line.rate);
  if (bound === 'low' && line.rate_low != null) rate = dec(line.rate_low);
  if (bound === 'high' && line.rate_high != null) rate = dec(line.rate_high);
  if (line.driver === 'copper') return qty.times(rate).times(dec(s.copper_multiplier));
  if (line.driver === 'freight') return qty.times(rate).times(dec(s.freight_multiplier));
  return qty.times(rate);
}

function adderDecimal(cell: Extraction, s: Sensitivity, bound: 'base' | 'low' | 'high' = 'base'): Decimal {
  if (!cell.cost_lines || cell.cost_lines.length === 0) return cents(dec(cell.cost_adder ?? 0));
  return cents(cell.cost_lines.reduce((sum, line) => sum.plus(lineAmount(line, s, bound)), ZERO));
}

const key = (paramId: string, vendorId: string) => `${paramId}|${vendorId}`;

/** True Evaluated Price = headline + technical penalties + commercial adders, per vendor. */
export function evaluateFinancials(
  tender: Tender,
  s: Sensitivity,
  overrides: Record<string, { adder_eur: string; note: string }> = {}
): VendorFinancials[] {
  return tender.vendors.map((v) => {
    let tech = ZERO;
    let commercial = ZERO;
    let low = ZERO;
    let high = ZERO;
    let hasUnpriced = false;
    const itemized = [];
    for (const p of tender.parameters) {
      const cell = p.vendors[v.id];
      if (!cell) continue;
      const o = overrides[key(p.id, v.id)];
      const adder = o ? cents(dec(o.adder_eur)) : adderDecimal(cell, s);
      const adderLow = o ? adder : adderDecimal(cell, s, 'low');
      const adderHigh = o ? adder : adderDecimal(cell, s, 'high');
      const pricing = o ? 'OVERRIDDEN' : cell.pricing_status;
      if (pricing === 'UNPRICED') hasUnpriced = true;
      if (p.criticality === 'COMMERCIAL') commercial = commercial.plus(adder);
      else tech = tech.plus(adder);
      low = low.plus(adderLow);
      high = high.plus(adderHigh);
      itemized.push({
        param_id: p.id,
        param_name: p.name,
        status: cell.status,
        is_conceded: false,
        adder_eur: adder.toNumber(),
        adder_low_eur: adderLow.toNumber(),
        adder_high_eur: adderHigh.toNumber(),
        criticality: p.criticality,
        pricing_status: pricing as any,
        is_overridden: Boolean(o),
        override_note: o ? o.note : null,
      });
    }
    const total = tech.plus(commercial);
    const priced = typeof v.headline_price === 'number' && v.headline_price > 0;
    const status = priced ? 'PRICED' : v.headline_status && v.headline_status !== 'PRICED' ? v.headline_status : 'NOT_FOUND';
    let headline: number | null = null;
    let tep: number | null = null;
    let tepLow: number | null = null;
    let tepHigh: number | null = null;
    let priceStatus: string;
    if (!priced) {
      priceStatus = status === 'NOT_FOUND' ? 'NO_HEADLINE' : status;
    } else {
      headline = v.headline_price as number;
      const h = dec(headline);
      tep = cents(h.plus(total)).toNumber();
      tepLow = cents(h.plus(low)).toNumber();
      tepHigh = cents(h.plus(high)).toNumber();
      priceStatus = hasUnpriced ? 'UNPRICED_ITEMS' : 'PRICED';
    }
    return {
      vendor_id: v.id,
      name: v.name,
      country: v.country,
      badge: v.badge,
      headline_price: headline,
      currency: 'EUR',
      total_tech_penalty: cents(tech).toNumber(),
      total_commercial_adder: cents(commercial).toNumber(),
      total_adders: cents(total).toNumber(),
      total_adders_low: cents(low).toNumber(),
      total_adders_high: cents(high).toNumber(),
      clawed_back_amount: 0,
      true_evaluated_price: tep,
      true_evaluated_low: tepLow,
      true_evaluated_high: tepHigh,
      price_status: priceStatus,
      itemized_breakdown: itemized,
    };
  });
}

// --- Review state ----------------------------------------------------------------------------

/** JSON with sorted keys, so a hash does not depend on key order. */
export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
}

/** SHA-256 of what a reviewer sees in a cell; a re-ingest that changes any of it makes a review stale. */
export function evidenceHash(cell: Extraction): string {
  const seen = {
    status: cell.status,
    extracted_text: cell.extracted_text,
    citation: cell.citation,
    secondary_citation: cell.secondary_citation,
    checks: cell.checks,
    flags: cell.flags ?? [],
    pricing_status: cell.pricing_status,
    cost_adder: cell.cost_adder,
    cost_lines: cell.cost_lines,
  };
  return createHash('sha256').update(stableJson(seen)).digest('hex');
}

/** The latest decision per cell. */
export function latestReviews(reviews: ReviewRow[]): Map<string, ReviewRow> {
  const out = new Map<string, ReviewRow>();
  for (const r of reviews) out.set(key(r.param_id, r.vendor_id), r);
  return out;
}

export type ReviewState = 'none' | 'open' | 'reviewed' | 'stale' | 'rejected';

export function reviewState(cell: Extraction, review: ReviewRow | undefined): ReviewState {
  if (!cell.flags || cell.flags.length === 0) return 'none';
  if (!review) return 'open';
  if (review.evidence_hash !== evidenceHash(cell)) return 'stale';
  return review.action === 'reject' ? 'rejected' : 'reviewed';
}

const MESSAGES = {
  unpriced: 'Gap has no price yet. Enter an amount or accept it.',
  needs_inspection: 'Check this quote against its page.',
  missing_price: 'Bid price not found. Correct the bid file and process it again.',
} as const;

const REVIEW_MESSAGES: Partial<Record<ReviewState, string>> = {
  open: 'Flag not reviewed yet.',
  stale: 'The source page changed after you accepted it. Review it again.',
  rejected: 'You rejected this quote. Correct the bid file and process it again.',
};

/** What still blocks verification, in vendor order then parameter order. */
export function openItems(state: TenderState): OpenItem[] {
  const latest = latestReviews(state.reviews);
  const items: OpenItem[] = [];
  for (const v of state.tender.vendors) {
    if (!(typeof v.headline_price === 'number' && v.headline_price > 0)) {
      items.push({ kind: 'missing_price', vendor_id: v.id, param_id: null, message: MESSAGES.missing_price });
    }
    for (const p of state.tender.parameters) {
      const cell = p.vendors[v.id];
      if (!cell) continue;
      const rs = reviewState(cell, latest.get(key(p.id, v.id)));
      const msg = REVIEW_MESSAGES[rs];
      if (msg) items.push({ kind: 'review_flag', vendor_id: v.id, param_id: p.id, message: msg });
      if (state.overrides[key(p.id, v.id)]) continue;
      const exposure = (cell.flags ?? []).some((f) => f.code === 'EXPOSURE_GAP');
      if (cell.pricing_status === 'UNPRICED' && !exposure) {
        items.push({ kind: 'unpriced', vendor_id: v.id, param_id: p.id, message: MESSAGES.unpriced });
      }
      if (cell.status === 'MANUAL_INSPECTION_REQUIRED') {
        items.push({ kind: 'needs_inspection', vendor_id: v.id, param_id: p.id, message: MESSAGES.needs_inspection });
      }
    }
  }
  return items;
}

export function reviewSummary(state: TenderState, blocking: number) {
  const latest = latestReviews(state.reviews);
  const counts = { open: 0, stale: 0, rejected: 0, reviewed: 0 };
  for (const p of state.tender.parameters) {
    for (const [vendorId, cell] of Object.entries(p.vendors)) {
      const rs = reviewState(cell, latest.get(key(p.id, vendorId)));
      if (rs in counts) counts[rs as keyof typeof counts]++;
    }
  }
  const unresolved = counts.open + counts.stale + counts.rejected;
  return {
    open_flags: counts.open,
    stale: counts.stale,
    rejected: counts.rejected,
    reviewed: counts.reviewed,
    final: state.meta.status === 'VERIFIED' && unresolved === 0 && blocking === 0,
  };
}

/** The JSON body GET /api/review/tenders/{id} returns: the Brief the dashboard renders. */
export function briefPayload(state: TenderState, s: Sensitivity = DEFAULT_SENSITIVITY): Brief {
  const items = openItems(state);
  const overrideEntries = Object.entries(state.overrides)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, o]) => {
      const [param_id, vendor_id] = k.split('|');
      return { param_id, vendor_id, adder_eur: cents(dec(o.adder_eur)).toFixed(2), note: o.note };
    });
  return {
    share_id: state.meta.share_id,
    status: state.meta.status,
    verified_at: state.meta.verified_at,
    synthetic: state.meta.synthetic,
    ingest_mode: state.meta.ingest_mode,
    ingest_stats: state.meta.ingest_stats,
    stage_log: state.meta.stage_log,
    documents: state.documents,
    tender: state.tender,
    financials: evaluateFinancials(state.tender, s, state.overrides),
    overrides: overrideEntries,
    open_items: items,
    review: reviewSummary(state, items.length),
  };
}

// --- Clarifications ---------------------------------------------------------------------------

const QUESTION: Record<string, string> = {
  DEVIATION_DOWNGRADE: 'Your offer does not meet the requirement. Confirm whether you can comply, and at what price.',
  CONFLICT_DOWNGRADE: 'Your offer states two different values. Confirm which one applies.',
  OMITTED: 'Your offer does not state this. Confirm what you are offering, with a reference to your documents.',
  MANUAL_INSPECTION_REQUIRED: 'We could not confirm this from your offer. Point us to the page that states it.',
};

function csvCell(value: unknown): string {
  const s = String(value ?? '');
  // A leading =, +, - or @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** One question per gap, quoting only that vendor's bid and the buyer's requirement. */
export function clarificationsCsv(tender: Tender, vendorId?: string | null): string {
  const header = ['vendor_id', 'vendor_name', 'param_id', 'parameter', 'status', 'requirement', 'requirement_source', 'offer', 'offer_source', 'question'];
  const rows: string[][] = [];
  for (const v of tender.vendors) {
    if (vendorId && v.id !== vendorId) continue;
    for (const p of tender.parameters) {
      const cell = p.vendors[v.id];
      if (!cell || !QUESTION[cell.status]) continue;
      rows.push([
        v.id,
        v.name,
        p.id,
        p.name,
        cell.status,
        p.mr_requirement,
        p.requirement_citation ? `${p.requirement_citation.filename} p.${p.requirement_citation.page}` : '',
        cell.extracted_text || '(not stated)',
        cell.citation ? `${cell.citation.filename} p.${cell.citation.page}` : '',
        QUESTION[cell.status],
      ]);
    }
  }
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
