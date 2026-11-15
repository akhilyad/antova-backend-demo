export type ComplianceStatus =
  | 'COMPLIANT'
  | 'CONFLICT_DOWNGRADE'
  | 'DEVIATION_DOWNGRADE'
  | 'DEVIATION_UPGRADE'
  | 'OMITTED'
  | 'MANUAL_INSPECTION_REQUIRED';

export type Criticality = 'MANDATORY' | 'HIGH' | 'MEDIUM' | 'COMMERCIAL';

export type PricingStatus = 'NONE' | 'PRICED' | 'UNPRICED';

export type BriefStatus = 'DRAFT' | 'VERIFIED';

export interface Citation {
  filename: string;
  page: number;
  bbox: [number, number, number, number];
  quote: string;
  paragraph: string;
  section: string;
  match?: string;
  rects?: [number, number, number, number][];
}

export interface CheckSpec {
  field: string;
  label: string;
  operator: string;
  required: string;
}

export interface Check {
  field: string;
  operator: string;
  required: string;
  offered: string;
  offered_canonical: string;
  passed: boolean;
  citation_ref: string;
  required_basis?: string | null;
  offered_basis?: string | null;
  comparable?: boolean;
  offered_equivalent?: number | null;
}

export interface CostLine {
  label: string;
  qty: string;
  unit: string;
  rate: string;
  driver: 'fixed' | 'copper' | 'labour' | 'freight';
  rate_low?: string | null;
  rate_high?: string | null;
}

export interface ReviewFlag {
  code: string;
  message: string;
}

export interface Segment {
  field: string;
  label: string;
  text: string;
  citation: Citation;
}

export interface Extraction {
  extracted_text: string;
  status: ComplianceStatus;
  confidence: number;
  bbox: string;
  snippet: string;
  conflict_note: string | null;
  cost_adder: number;
  adder_formula: string;
  cost_lines: CostLine[];
  pricing_status: PricingStatus;
  citation: Citation | null;
  secondary_citation: Citation | null;
  checks: Check[];
  rate_table_version: string | null;
  flags?: ReviewFlag[];
  evidence?: string | null;
  segments?: Segment[];
  field_citations?: Record<string, Citation>;
  assembled_from?: string | null;
}

export interface Parameter {
  id: string;
  category: string;
  name: string;
  mr_requirement: string;
  pint_rule: string;
  criticality: Criticality;
  vendors: Record<string, Extraction>;
  requirement_citation: Citation | null;
  checks_spec: CheckSpec[];
}

export interface Vendor {
  id: string;
  name: string;
  country: string;
  headline_price: number | null;
  doc_name: string;
  cover_claim: string;
  badge: string;
  headline_citation: Citation | null;
  headline_status?: string | null;
  currency?: string | null;
  headline_original?: string | null;
  fx_rate?: string | null;
  fx_date?: string | null;
}

export interface Tender {
  id: string;
  title: string;
  client: string;
  mr_doc: string;
  pages_parsed: number;
  latency_sec: number;
  compute_cogs?: number;
  vendors: Vendor[];
  parameters: Parameter[];
  equipment_class: string;
  rate_table_version: string;
  project?: Record<string, any>;
  findings?: Record<string, any>;
}

export interface ItemizedAdder {
  param_id: string;
  param_name: string;
  status: ComplianceStatus;
  is_conceded: boolean;
  adder_eur: number;
  adder_low_eur?: number;
  adder_high_eur?: number;
  criticality: Criticality;
  pricing_status?: string;
  is_overridden: boolean;
  override_note: string | null;
}

export interface VendorFinancials {
  vendor_id: string;
  name: string;
  country: string;
  badge: string;
  headline_price: number | null;
  currency?: string;
  total_tech_penalty: number;
  total_commercial_adder: number;
  total_adders: number;
  total_adders_low?: number;
  total_adders_high?: number;
  clawed_back_amount: number;
  true_evaluated_price: number | null;
  true_evaluated_low?: number | null;
  true_evaluated_high?: number | null;
  price_status?: string;
  itemized_breakdown: ItemizedAdder[];
}

export interface OverrideEntry {
  param_id: string;
  vendor_id: string;
  adder_eur: string;
  note: string;
}

export interface OpenItem {
  kind: 'unpriced' | 'needs_inspection' | 'missing_price' | 'review_flag' | 'project_field';
  vendor_id: string;
  param_id: string | null;
  message: string;
}

export interface ReviewRow {
  id: number;
  tender_id: string;
  param_id: string;
  vendor_id: string;
  action: 'approve' | 'override' | 'reject';
  reviewer: string;
  note: string;
  evidence_hash: string;
  created_at: string;
}

export interface ReviewPutResponse extends ReviewRow {
  state: 'none' | 'open' | 'reviewed' | 'stale' | 'rejected' | string;
}

export interface SourceDocument {
  filename: string;
  role: string;
  vendor_id: string | null;
  page_count: number;
}

export interface StageLogEntry {
  stage: string;
  pct: number;
  t_ms: number;
}

export interface IngestStats {
  tender_id: string;
  documents: number;
  pages_parsed: number;
  sld_sheets: number;
  candidates_accepted: number;
  candidates_rejected: number;
  rules_evaluated: number;
  deviations_found: number;
  exposed_risk_eur: number;
  sweep_hits?: number;
  sweep_new_candidates?: number;
  sweep_recall?: number;
  flags_raised?: number;
  locales?: Record<string, string>;
  no_text_pages?: Record<string, number[]>;
  run_fingerprint?: string;
  run_id?: string;
  unpriced_items?: Array<{ vendor_id: string; param_id: string; classes: string[] }>;
  warnings?: string[];
  rate_table_effective_date?: string;
  api_cost_usd?: number;
  cogs_usd?: number;
  duration_s: number;
  ingest_mode: string;
  synthetic: boolean;
}

export interface Brief {
  share_id: string;
  status: BriefStatus;
  verified_at: string | null;
  synthetic: boolean;
  ingest_mode: string;
  ingest_stats: IngestStats | null;
  stage_log: StageLogEntry[];
  documents: SourceDocument[];
  tender: Tender;
  financials: VendorFinancials[];
  overrides: OverrideEntry[];
  open_items: OpenItem[];
  review?: {
    open_flags: number;
    stale: number;
    rejected: number;
    reviewed: number;
    final: boolean;
  };
}

export interface ReviewTenderRow {
  tender_id: string;
  title: string;
  status: BriefStatus;
  share_id: string;
  ingested_at: string;
  verified_at: string | null;
  open_items: number;
}

export type JobStatusType = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface Job {
  job_id: string;
  status: JobStatusType;
  progress_pct: number;
  stage: string;
  created_at: string;
  completed_at: string | null;
  result?: (IngestStats & { stage_log: StageLogEntry[]; overrides_cleared: OverrideEntry[] }) | null;
  error?: string | null;
}

export interface RatesSettings {
  copper_multiplier: number;
  site_labor_rate?: number;
  freight_multiplier: number;
}

export interface EvaluateResponse {
  financials: VendorFinancials[];
}
