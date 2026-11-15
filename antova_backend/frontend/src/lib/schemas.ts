/**
 * Antova Unified Zod Schemas
 * Source of truth aligned with backend FastAPI models and web/src/api/schemas.ts
 */
import { z } from 'zod';

export const ComplianceStatus = z.enum([
  'COMPLIANT',
  'CONFLICT_DOWNGRADE',
  'DEVIATION_DOWNGRADE',
  'DEVIATION_UPGRADE',
  'OMITTED',
  'MANUAL_INSPECTION_REQUIRED',
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatus>;

export const Criticality = z.enum(['MANDATORY', 'HIGH', 'MEDIUM', 'COMMERCIAL']);
export type Criticality = z.infer<typeof Criticality>;

export const PricingStatus = z.enum(['NONE', 'PRICED', 'UNPRICED']);
export type PricingStatus = z.infer<typeof PricingStatus>;

export const BriefStatus = z.enum(['DRAFT', 'VERIFIED']);
export type BriefStatus = z.infer<typeof BriefStatus>;

/** Where a quote sits: a page and a PDF-point box [x0, y0, x1, y1]. */
export const Citation = z.object({
  filename: z.string(),
  page: z.number().int(),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  quote: z.string(),
  paragraph: z.string(),
  section: z.string(),
  match: z.string().optional(),
  rects: z.array(z.tuple([z.number(), z.number(), z.number(), z.number()])).optional(),
});
export type Citation = z.infer<typeof Citation>;

export const CheckSpec = z.object({
  field: z.string(),
  label: z.string(),
  operator: z.string(),
  required: z.string(),
});
export type CheckSpec = z.infer<typeof CheckSpec>;

export const Check = z.object({
  field: z.string(),
  operator: z.string(),
  required: z.string(),
  offered: z.string(),
  offered_canonical: z.string(),
  passed: z.boolean(),
  citation_ref: z.string(),
  required_basis: z.string().nullable().optional(),
  offered_basis: z.string().nullable().optional(),
  comparable: z.boolean().optional(),
  offered_equivalent: z.number().nullable().optional(),
});
export type Check = z.infer<typeof Check>;

export const CostLine = z.object({
  label: z.string(),
  qty: z.string(),
  unit: z.string(),
  rate: z.string(),
  driver: z.enum(['fixed', 'copper', 'labour', 'freight']),
  rate_low: z.string().nullable().optional(),
  rate_high: z.string().nullable().optional(),
});
export type CostLine = z.infer<typeof CostLine>;

export const ReviewFlag = z.object({
  code: z.string(),
  message: z.string(),
});
export type ReviewFlag = z.infer<typeof ReviewFlag>;

export const Segment = z.object({
  field: z.string(),
  label: z.string(),
  text: z.string(),
  citation: Citation,
});
export type Segment = z.infer<typeof Segment>;

export const Extraction = z.object({
  extracted_text: z.string().default(''),
  status: ComplianceStatus,
  confidence: z.number().optional().nullable(),
  bbox: z.string().default(''),
  snippet: z.string().default(''),
  conflict_note: z.string().nullable().optional(),
  cost_adder: z.number().optional().nullable(),
  adder_formula: z.string().default(''),
  cost_lines: z.array(CostLine).default([]),
  pricing_status: PricingStatus.default('NONE'),
  citation: Citation.nullable().optional(),
  secondary_citation: Citation.nullable().optional(),
  checks: z.array(Check).default([]),
  rate_table_version: z.string().nullable().optional(),
  flags: z.array(ReviewFlag).optional(),
  evidence: z.string().nullable().optional(),
  segments: z.array(Segment).optional(),
  field_citations: z.record(z.string(), Citation).optional(),
  assembled_from: z.string().nullable().optional(),
});
export type Extraction = z.infer<typeof Extraction>;

export const Parameter = z.object({
  id: z.string(),
  category: z.string().default(''),
  name: z.string(),
  mr_requirement: z.string().default(''),
  pint_rule: z.string().default(''),
  criticality: Criticality,
  vendors: z.record(z.string(), Extraction),
  requirement_citation: Citation.nullable().optional(),
  checks_spec: z.array(CheckSpec).default([]),
});
export type Parameter = z.infer<typeof Parameter>;

export const Vendor = z.object({
  id: z.string(),
  name: z.string(),
  country: z.string(),
  headline_price: z.number().nullable(),
  doc_name: z.string().default(''),
  cover_claim: z.string().default(''),
  badge: z.string().default(''),
  headline_citation: Citation.nullable().optional(),
  headline_status: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  headline_original: z.string().nullable().optional(),
  fx_rate: z.string().nullable().optional(),
  fx_date: z.string().nullable().optional(),
});
export type Vendor = z.infer<typeof Vendor>;

export const FindingMoney = z.object({
  basis: z.enum(['adder', 'exposure']),
  kind: z.string(),
  amount: z.string().nullable(),
  formula: z.string().optional(),
  reason: z.string().optional(),
  lines: z
    .array(
      z.object({
        label: z.string(),
        qty: z.union([z.string(), z.number()]),
        unit: z.string(),
        rate: z.union([z.string(), z.number()]),
        driver: z.string(),
      })
    )
    .optional(),
  inputs: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number()]),
        source: z.string(),
      })
    )
    .optional(),
});
export type FindingMoney = z.infer<typeof FindingMoney>;

export const Finding = z.object({
  vendor_id: z.string(),
  param_id: z.string(),
  kind: z.enum([
    'deviation',
    'conflict',
    'omitted',
    'unstated',
    'claim_only',
    'schedule_unassessed',
    'critical_path_breach',
  ]),
  severity: z.enum(['critical', 'major', 'minor']),
  message: z.string(),
  citations: z.array(Citation).default([]),
  money: z.array(FindingMoney).default([]),
});
export type Finding = z.infer<typeof Finding>;

export const Tender = z.object({
  id: z.string(),
  title: z.string(),
  client: z.string(),
  mr_doc: z.string(),
  pages_parsed: z.number().int(),
  latency_sec: z.number().int().optional().default(0),
  compute_cogs: z.number().optional(),
  vendors: z.array(Vendor),
  parameters: z.array(Parameter),
  equipment_class: z.string(),
  rate_table_version: z.string(),
  project: z.record(z.string(), z.any()).nullable().optional(),
  findings: z.array(Finding).nullable().optional(),
});
export type Tender = z.infer<typeof Tender>;

export const ItemizedAdder = z.object({
  param_id: z.string(),
  param_name: z.string(),
  status: ComplianceStatus,
  is_conceded: z.boolean().default(false),
  adder_eur: z.number().nullable().optional(),
  adder_low_eur: z.number().nullable().optional(),
  adder_high_eur: z.number().nullable().optional(),
  criticality: Criticality,
  pricing_status: z.string().optional(),
  is_overridden: z.boolean().default(false),
  override_note: z.string().nullable().optional(),
});
export type ItemizedAdder = z.infer<typeof ItemizedAdder>;

export const VendorFinancials = z.object({
  vendor_id: z.string(),
  name: z.string(),
  country: z.string(),
  badge: z.string(),
  headline_price: z.number().nullable(),
  currency: z.string().optional().default('EUR'),
  total_tech_penalty: z.number(),
  total_commercial_adder: z.number(),
  total_adders: z.number(),
  total_adders_low: z.number().optional(),
  total_adders_high: z.number().optional(),
  clawed_back_amount: z.number().default(0),
  true_evaluated_price: z.number().nullable(),
  true_evaluated_low: z.number().nullable().optional(),
  true_evaluated_high: z.number().nullable().optional(),
  price_status: z.string().optional(),
  itemized_breakdown: z.array(ItemizedAdder),
});
export type VendorFinancials = z.infer<typeof VendorFinancials>;

export const OverrideEntry = z.object({
  param_id: z.string(),
  vendor_id: z.string(),
  adder_eur: z.string(),
  note: z.string(),
});
export type OverrideEntry = z.infer<typeof OverrideEntry>;

export const OpenItem = z.object({
  kind: z.enum(['unpriced', 'needs_inspection', 'missing_price', 'review_flag', 'project_field']),
  vendor_id: z.string(),
  param_id: z.string().nullable(),
  message: z.string(),
});
export type OpenItem = z.infer<typeof OpenItem>;

export const SourceDocument = z.object({
  filename: z.string(),
  role: z.string(),
  vendor_id: z.string().nullable(),
  page_count: z.number().int(),
});
export type SourceDocument = z.infer<typeof SourceDocument>;

export const StageLogEntry = z.object({
  stage: z.string(),
  pct: z.number().int(),
  t_ms: z.number().int(),
});
export type StageLogEntry = z.infer<typeof StageLogEntry>;

export const IngestStats = z.object({
  tender_id: z.string(),
  documents: z.number().int(),
  pages_parsed: z.number().int(),
  sld_sheets: z.number().int().optional().default(0),
  candidates_accepted: z.number().int(),
  candidates_rejected: z.number().int(),
  rules_evaluated: z.number().int(),
  deviations_found: z.number().int(),
  exposed_risk_eur: z.number().default(0),
  sweep_hits: z.number().int().optional(),
  sweep_new_candidates: z.number().int().optional(),
  sweep_recall: z.number().optional(),
  flags_raised: z.number().int().optional(),
  locales: z.record(z.string(), z.string()).optional(),
  no_text_pages: z.record(z.string(), z.array(z.number().int())).optional(),
  run_fingerprint: z.string().optional(),
  run_id: z.string().optional(),
  unpriced_items: z.array(z.any()).optional().default([]),
  warnings: z.array(z.string()).optional().default([]),
  rate_table_effective_date: z.string().optional(),
  api_cost_usd: z.number().optional(),
  cogs_usd: z.number().optional(),
  duration_s: z.number(),
  ingest_mode: z.string(),
  synthetic: z.boolean(),
});
export type IngestStats = z.infer<typeof IngestStats>;

export const ReviewSummary = z.object({
  open_flags: z.number().int(),
  stale: z.number().int(),
  rejected: z.number().int(),
  reviewed: z.number().int(),
  final: z.boolean(),
});
export type ReviewSummary = z.infer<typeof ReviewSummary>;

export const Brief = z.object({
  share_id: z.string(),
  status: BriefStatus,
  verified_at: z.string().nullable(),
  synthetic: z.boolean(),
  ingest_mode: z.string(),
  ingest_stats: IngestStats.nullable().optional(),
  stage_log: z.array(StageLogEntry).default([]),
  documents: z.array(SourceDocument).default([]),
  tender: Tender,
  financials: z.array(VendorFinancials).default([]),
  overrides: z.array(OverrideEntry).default([]),
  open_items: z.array(OpenItem).default([]),
  review: ReviewSummary.optional(),
});
export type Brief = z.infer<typeof Brief>;

export const ReviewTenderSummary = z.object({
  tender_id: z.string(),
  title: z.string(),
  status: BriefStatus,
  share_id: z.string(),
  ingested_at: z.string(),
  verified_at: z.string().nullable(),
  open_items: z.number().int(),
});
export type ReviewTenderSummary = z.infer<typeof ReviewTenderSummary>;

export const JobStatus = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export type JobStatus = z.infer<typeof JobStatus>;

export const Job = z.object({
  job_id: z.string(),
  status: JobStatus,
  progress_pct: z.number().int(),
  stage: z.string(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  result: z.any().nullable().optional(),
  error: z.string().nullable().optional(),
});
export type Job = z.infer<typeof Job>;

export const RatesSettings = z.object({
  copper_multiplier: z.number(),
  site_labor_rate: z.number().optional(),
  freight_multiplier: z.number(),
});
export type RatesSettings = z.infer<typeof RatesSettings>;
