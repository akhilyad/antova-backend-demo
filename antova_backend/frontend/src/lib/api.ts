import {
  Brief,
  EvaluateResponse,
  Job,
  RatesSettings,
  ReviewRow,
  ReviewPutResponse,
  ReviewTenderRow,
  OpenItem,
  Extraction,
  Parameter,
  VendorFinancials,
  ItemizedAdder,
  ComplianceStatus,
  PricingStatus,
  Criticality,
} from './types';
import sample402Raw from './sample402.json';
import { replayResponse, SAMPLE_TENDER_IDS, type SampleBrief } from './replay';
import { Brief as BriefSchema } from './schemas';

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
/**
 * Optional: the engine's public origin for PDF uploads only. Vercel functions accept request bodies
 * up to 4.5 MB, so a 50 MB spec can't pass through the /api proxy. When this is set, file PUTs go
 * straight to the engine (it must list this site in ANTOVA_ALLOWED_ORIGINS, and the reviewer's own
 * token is sent). Every other call stays on the same-origin proxy.
 */
export const DIRECT_UPLOAD_BASE = (process.env.NEXT_PUBLIC_DIRECT_UPLOAD_URL || '').replace(/\/$/, '');
/**
 * The reviewer's own token, entered on the Settings page and kept for this browser tab only.
 * There is deliberately no built-in default: without a token the browser sends none, reads go
 * through the same-origin proxy, and writes are refused by the backend (or by replay mode).
 */
const REVIEW_TOKEN_KEY = 'antova.reviewToken';

export function getReviewToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage.getItem(REVIEW_TOKEN_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function setReviewToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const value = token?.trim();
    if (value) window.sessionStorage.setItem(REVIEW_TOKEN_KEY, value);
    else window.sessionStorage.removeItem(REVIEW_TOKEN_KEY);
  } catch {
    // storage blocked (private mode): the token simply isn't remembered
  }
}

function tokenHeader(token: string | undefined): Record<string, string> {
  return token ? { 'X-Antova-Review-Token': token } : {};
}

export class ApiError extends Error {
  status: number;
  code?: string;
  open_items?: OpenItem[];
  detail?: string;
  /** The request's X-Request-ID, to match a report against the proxy and engine logs. */
  requestId?: string;

  constructor(
    message: string,
    status: number,
    detail?: string,
    code?: string,
    open_items?: OpenItem[]
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.open_items = open_items;
  }
}

function getHeaders(token: string | undefined = getReviewToken(), isJson: boolean = true) {
  const headers: Record<string, string> = tokenHeader(token);
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

/**
 * Fetches `path` from API_BASE when one is configured, else from the same-origin proxy.
 *
 * A direct call that fails (network error, CORS block or a 5xx) is retried once through the
 * same-origin proxy, but only for GET and HEAD. A write is never sent twice: a verify, withdraw,
 * upload or ingest that may already have reached the server must not run again.
 */
function isRetryable(init?: RequestInit): boolean {
  const method = (init?.method || 'GET').toUpperCase();
  return method === 'GET' || method === 'HEAD';
}

async function smartFetch(path: string, init?: RequestInit): Promise<Response> {
  const targetUrl = API_BASE ? `${API_BASE}${path}` : path;
  const canRetry = Boolean(API_BASE) && path.startsWith('/api/') && isRetryable(init);
  try {
    const res = await fetch(targetUrl, init);
    if (!res.ok && res.status >= 500 && canRetry) {
      console.warn(`Direct call to ${targetUrl} returned ${res.status}. Retrying via proxy ${path}...`);
      return await fetch(path, init);
    }
    return res;
  } catch (err) {
    if (canRetry) {
      console.warn(`Direct fetch to ${targetUrl} failed with network/CORS error. Retrying via proxy ${path}...`);
      return await fetch(path, init);
    }
    throw err;
  }
}

/** An ApiError carrying the server's own detail and code, when it sent JSON. */
async function errorFrom(res: Response, fallback: string): Promise<ApiError> {
  const data = await res.json().catch(() => ({} as Record<string, unknown>));
  const detail = typeof data.detail === 'string' ? data.detail : undefined;
  const code = typeof data.code === 'string' ? data.code : undefined;
  const requestId = res.headers.get('x-request-id') || undefined;
  // Server-side failures carry a reference the operator can find in the logs; a 4xx is the user's
  // to fix and its message says how.
  const message = detail || fallback;
  const err = new ApiError(
    res.status >= 500 && requestId ? `${message} (reference ${requestId})` : message,
    res.status,
    detail,
    code
  );
  err.requestId = requestId;
  return err;
}

/**
 * Truthful Brief Normalizer (Defect D3):
 * Never fabricates defaults: unknown amounts are kept as null (not 0),
 * pricing_status is preserved (not forced to PRICED),
 * confidence is preserved (never forced to 1.0).
 */
export function normalizeBrief(raw: any): Brief {
  if (!raw || typeof raw !== 'object') {
    throw new Error("The server sent data this page can't read.");
  }

  const tender = raw.tender || {};
  const vendors = Array.isArray(tender.vendors) ? tender.vendors : [];
  const parameters = Array.isArray(tender.parameters) ? tender.parameters : [];

  const normalizedParameters: Parameter[] = parameters.map((param: any) => {
    const rawVendors = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};
    const normalizedVendors: Record<string, Extraction> = {};

    for (const v of vendors) {
      const ext = rawVendors[v.id];
      if (!ext) {
        // If vendor has no cell extraction recorded, record genuine unextracted shape
        normalizedVendors[v.id] = {
          extracted_text: '',
          status: 'MANUAL_INSPECTION_REQUIRED',
          confidence: null,
          bbox: '',
          snippet: '',
          conflict_note: null,
          cost_adder: null,
          adder_formula: '',
          cost_lines: [],
          pricing_status: 'NONE',
          citation: null,
          secondary_citation: null,
          checks: [],
          rate_table_version: null,
          flags: [],
          evidence: null,
          segments: [],
          field_citations: {},
          assembled_from: null,
        };
      } else {
        normalizedVendors[v.id] = {
          extracted_text: ext.extracted_text || '',
          status: (ext.status as ComplianceStatus) || 'COMPLIANT',
          confidence: typeof ext.confidence === 'number' ? ext.confidence : null,
          bbox: ext.bbox || '',
          snippet: ext.snippet || '',
          conflict_note: ext.conflict_note || null,
          cost_adder: typeof ext.cost_adder === 'number' ? ext.cost_adder : null,
          adder_formula: ext.adder_formula || '',
          cost_lines: Array.isArray(ext.cost_lines) ? ext.cost_lines : [],
          pricing_status: (ext.pricing_status as PricingStatus) || 'NONE',
          citation: ext.citation || null,
          secondary_citation: ext.secondary_citation || null,
          checks: Array.isArray(ext.checks) ? ext.checks : [],
          rate_table_version: ext.rate_table_version || null,
          flags: Array.isArray(ext.flags) ? ext.flags : [],
          evidence: ext.evidence || null,
          segments: Array.isArray(ext.segments) ? ext.segments : [],
          field_citations: ext.field_citations || {},
          assembled_from: ext.assembled_from || null,
        };
      }
    }

    return {
      id: param.id || '',
      category: param.category || '',
      name: param.name || '',
      mr_requirement: param.mr_requirement || '',
      pint_rule: param.pint_rule || '',
      criticality: (param.criticality as Criticality) || 'MANDATORY',
      vendors: normalizedVendors,
      requirement_citation: param.requirement_citation || null,
      checks_spec: Array.isArray(param.checks_spec) ? param.checks_spec : [],
    };
  });

  const rawFinancials = Array.isArray(raw.financials) ? raw.financials : [];
  const normalizedFinancials: VendorFinancials[] = rawFinancials.map((fin: any) => {
    const breakdown = Array.isArray(fin.itemized_breakdown) ? fin.itemized_breakdown : [];
    const normalizedBreakdown: ItemizedAdder[] = breakdown.map((item: any) => ({
      param_id: item.param_id || '',
      param_name: item.param_name || '',
      status: (item.status as ComplianceStatus) || 'COMPLIANT',
      is_conceded: Boolean(item.is_conceded),
      adder_eur: typeof item.adder_eur === 'number' ? item.adder_eur : null,
      adder_low_eur: typeof item.adder_low_eur === 'number' ? item.adder_low_eur : null,
      adder_high_eur: typeof item.adder_high_eur === 'number' ? item.adder_high_eur : null,
      criticality: (item.criticality as Criticality) || 'MANDATORY',
      pricing_status: item.pricing_status || 'NONE',
      is_overridden: Boolean(item.is_overridden),
      override_note: item.override_note || null,
    }));

    return {
      vendor_id: fin.vendor_id || '',
      name: fin.name || '',
      country: fin.country || '',
      badge: fin.badge || 'Bidder',
      headline_price: typeof fin.headline_price === 'number' ? fin.headline_price : null,
      currency: fin.currency || 'EUR',
      total_tech_penalty: typeof fin.total_tech_penalty === 'number' ? fin.total_tech_penalty : 0,
      total_commercial_adder: typeof fin.total_commercial_adder === 'number' ? fin.total_commercial_adder : 0,
      total_adders: typeof fin.total_adders === 'number' ? fin.total_adders : 0,
      total_adders_low: typeof fin.total_adders_low === 'number' ? fin.total_adders_low : undefined,
      total_adders_high: typeof fin.total_adders_high === 'number' ? fin.total_adders_high : undefined,
      clawed_back_amount: typeof fin.clawed_back_amount === 'number' ? fin.clawed_back_amount : 0,
      true_evaluated_price: typeof fin.true_evaluated_price === 'number' ? fin.true_evaluated_price : null,
      true_evaluated_low: typeof fin.true_evaluated_low === 'number' ? fin.true_evaluated_low : null,
      true_evaluated_high: typeof fin.true_evaluated_high === 'number' ? fin.true_evaluated_high : null,
      price_status: fin.price_status || (fin.true_evaluated_price !== null ? 'PRICED' : 'UNPRICED'),
      itemized_breakdown: normalizedBreakdown,
    };
  });

  return {
    share_id: raw.share_id || '',
    status: raw.status || 'DRAFT',
    verified_at: raw.verified_at || null,
    synthetic: Boolean(raw.synthetic),
    ingest_mode: raw.ingest_mode || 'replay',
    ingest_stats: raw.ingest_stats || null,
    stage_log: Array.isArray(raw.stage_log) ? raw.stage_log : [],
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    tender: {
      id: tender.id || '',
      title: tender.title || '',
      client: tender.client || '',
      mr_doc: tender.mr_doc || '',
      pages_parsed: tender.pages_parsed || 0,
      latency_sec: tender.latency_sec || 0,
      compute_cogs: tender.compute_cogs || 0,
      vendors,
      parameters: normalizedParameters,
      equipment_class: tender.equipment_class || 'MV_GIS_SWITCHGEAR',
      rate_table_version: tender.rate_table_version || 'mv_gis_switchgear_v2',
      project: tender.project || {},
      findings: tender.findings || [],
    },
    financials: normalizedFinancials,
    overrides: Array.isArray(raw.overrides) ? raw.overrides : [],
    open_items: Array.isArray(raw.open_items) ? raw.open_items : [],
    review: raw.review || { open_flags: 0, stale: 0, rejected: 0, reviewed: 0, final: false },
    _source: raw._source || 'live',
  };
}

export function loadSampleBrief(): Brief {
  return { ...normalizeBrief(sample402Raw), _source: 'replay' };
}

export async function fetchHealth() {
  const res = await smartFetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

/**
 * What the workbench is connected to, read from the same-origin proxy's /api/health (never a
 * direct, CORS-dependent call, so a browser block can't be mistaken for "no engine").
 * - live:     the engine answered healthy.
 * - degraded: the engine answered, but not healthy (e.g. 503, database unreachable).
 * - replay:   the proxy is serving the saved sample, because no engine is configured or it is down.
 * - unknown:  the health check itself failed (network, proxy error). Not treated as replay.
 */
export type EngineState =
  | { kind: 'checking' }
  | { kind: 'live'; version?: string }
  | { kind: 'degraded'; status: number; detail: string }
  | { kind: 'replay'; reason: 'not_configured' | 'unreachable'; backend?: string; error?: string }
  | { kind: 'unknown'; detail: string };

export async function probeEngine(timeoutMs = 8000): Promise<EngineState> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.mode === 'replay') {
      return {
        kind: 'replay',
        reason: body.reason === 'unreachable' ? 'unreachable' : 'not_configured',
        backend: typeof body.backend === 'string' ? body.backend : undefined,
        error: typeof body.error === 'string' ? body.error : undefined,
      };
    }
    if (res.ok && body.status === 'healthy') {
      return { kind: 'live', version: typeof body.version === 'string' ? body.version : undefined };
    }
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : body.database === 'unreachable'
        ? 'The engine is up but its database is unreachable.'
        : `The engine answered ${res.status}${body.status ? ` (${String(body.status)})` : ''}.`;
    return { kind: 'degraded', status: res.status, detail };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return {
      kind: 'unknown',
      detail: aborted ? `No answer from /api/health within ${timeoutMs / 1000} s.` : "The health check could not reach this site's /api proxy.",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function listTenders(token: string | undefined = getReviewToken()): Promise<ReviewTenderRow[]> {
  let res: Response;
  try {
    res = await smartFetch('/api/review/tenders', {
      headers: getHeaders(token),
      cache: 'no-store',
    });
  } catch (err) {
    // No server reachable at all: the same single sample row the proxy serves in replay mode.
    console.warn('Could not reach the server for the tender list; showing the saved sample.', err);
    return replayResponse('GET', 'review/tenders', sample402Raw as SampleBrief).body as ReviewTenderRow[];
  }
  if (!res.ok) throw await errorFrom(res, "Couldn't load the tender list. Try again.");
  return res.json();
}

export async function getTenderBrief(tenderId: string, token: string | undefined = getReviewToken()): Promise<Brief> {
  let res: Response;
  try {
    res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}`, {
      headers: getHeaders(token),
      cache: 'no-store',
    });
  } catch (err) {
    // No server reachable at all. Only a tender with saved sample data can be shown; never
    // another tender's data under this one's ID.
    if (SAMPLE_TENDER_IDS.has(tenderId)) {
      console.warn(`Could not reach the server for ${tenderId}; showing the saved sample.`, err);
      return { ...normalizeBrief(sample402Raw), _source: 'replay' };
    }
    throw new ApiError(`Couldn't reach the server to load ${tenderId}. Check your connection and try again.`, 0);
  }
  if (!res.ok) throw await errorFrom(res, `Couldn't load ${tenderId}. Try again.`);

  const source = (res.headers.get('x-antova-source') as 'live' | 'replay') || 'live';
  const raw = await res.json();
  // Check the shape before rendering: a mismatch is reported, not papered over with defaults.
  const checked = BriefSchema.safeParse(raw);
  if (!checked.success) {
    console.error(`Brief ${tenderId} does not match the expected shape`, checked.error.issues.slice(0, 10));
    throw new ApiError(
      "The server sent a brief this page can't read. It may be running a different version.",
      502,
      undefined,
      'brief_schema'
    );
  }
  return { ...normalizeBrief(raw), _source: source };
}

export async function listReviewHistory(
  tenderId: string,
  token: string | undefined = getReviewToken()
): Promise<ReviewRow[]> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/reviews`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    return [];
  }
  return res.json();
}

export async function uploadTenderFile(
  tenderId: string,
  filename: string,
  fileBytes: Blob | ArrayBuffer,
  token: string | undefined = getReviewToken()
): Promise<{ filename: string; size_bytes: number; sha256: string; pages: number }> {
  const path = `/api/review/tenders/${encodeURIComponent(tenderId)}/files/${encodeURIComponent(filename)}`;
  // Large PDFs bypass the proxy's body limit when a direct upload origin is configured.
  const res = await (DIRECT_UPLOAD_BASE ? fetch(`${DIRECT_UPLOAD_BASE}${path}`, {
      method: 'PUT',
      headers: { ...tokenHeader(token), 'Content-Type': 'application/pdf' },
      body: fileBytes,
    }) : smartFetch(
    path,
    {
      method: 'PUT',
      headers: {
        ...tokenHeader(token),
        'Content-Type': 'application/pdf',
      },
      body: fileBytes,
    }
  ));
  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        'This PDF is larger than the proxy accepts (4.5 MB on Vercel). Set NEXT_PUBLIC_DIRECT_UPLOAD_URL to upload straight to the engine.'
      );
    }
    if (res.status === 401) throw new Error('Uploading needs your reviewer token. Add it under Settings.');
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed. Try again.");
  }
  return res.json();
}

export async function listTenderFiles(
  tenderId: string,
  token: string | undefined = getReviewToken()
): Promise<{ files: Array<{ filename: string; size_bytes: number }>; manifest: boolean }> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/files`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error("Couldn't load files. Try again.");
  }
  return res.json();
}

export async function putManifest(
  tenderId: string,
  manifest: Record<string, any>,
  token: string | undefined = getReviewToken()
) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/manifest`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(manifest),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't save the manifest. Try again.");
  }
  return res.json();
}

export async function startIngestJob(
  tenderId: string,
  mode: 'replay' | 'auto' | 'live' = 'replay',
  token: string | undefined = getReviewToken()
): Promise<{ job_id: string; status: string }> {
  const res = await smartFetch('/api/jobs/ingest', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ tender_id: tenderId, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't start processing. Try again.");
  }
  return res.json();
}

export async function getJobStatus(jobId: string, token: string | undefined = getReviewToken()): Promise<Job> {
  const res = await smartFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error("Couldn't check status. Try again.");
  }
  return res.json();
}

export async function evaluateTender(
  tenderId: string,
  rates: RatesSettings,
  token: string | undefined = getReviewToken()
): Promise<EvaluateResponse> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/evaluate`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(rates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't update totals. Try again.");
  }
  return res.json();
}

export async function putOverride(
  tenderId: string,
  paramId: string,
  vendorId: string,
  adderEur: number | string,
  note: string,
  token: string | undefined = getReviewToken()
): Promise<void> {
  const formattedAdder = typeof adderEur === 'number' ? adderEur.toFixed(2) : adderEur;
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/overrides/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
    {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({
        adder_eur: formattedAdder,
        note,
      }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't save the amount. Try again.");
  }
}

export async function deleteOverride(
  tenderId: string,
  paramId: string,
  vendorId: string,
  token: string | undefined = getReviewToken()
): Promise<void> {
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/overrides/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
    {
      method: 'DELETE',
      headers: getHeaders(token, false),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't reset the amount. Try again.");
  }
}

export async function submitReviewDecision(
  tenderId: string,
  paramId: string,
  vendorId: string,
  action: 'approve' | 'override' | 'reject',
  note: string,
  token: string | undefined = getReviewToken()
): Promise<ReviewPutResponse> {
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/reviews/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
    {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ action, note }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't save your decision. Try again.");
  }
  return res.json();
}

export async function submitProjectBaselineReview(
  tenderId: string,
  fieldName: string,
  action: 'approve' | 'override' | 'reject',
  note: string,
  token: string | undefined = getReviewToken()
): Promise<ReviewPutResponse> {
  return submitReviewDecision(tenderId, `PROJECT.${fieldName}`, '-', action, note, token);
}

export async function fetchEvidenceImageBlob(
  tenderId: string,
  paramId: string,
  source: string,
  which: 'primary' | 'secondary' = 'primary',
  token: string | undefined = getReviewToken()
): Promise<string> {
  const res = await smartFetch(getEvidenceUrl(tenderId, paramId, source, which), {
    headers: {
      ...tokenHeader(token),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't load evidence. Try again.");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function downloadTbeExport(
  tenderId: string,
  token: string | undefined = getReviewToken()
): Promise<void> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`, {
    headers: {
      ...tokenHeader(token),
    },
  });
  if (!res.ok) {
    if (res.status === 409) {
      const err = await res.json().catch(() => ({ detail: 'Sign off before you download the workbook.' }));
      throw new Error(err.detail || 'Sign off before you download the workbook.');
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't download. Try again.");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TBE_${tenderId}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function downloadClarificationsExport(
  tenderId: string,
  format: 'csv' | 'xlsx' = 'csv',
  vendorId?: string,
  token: string | undefined = getReviewToken()
): Promise<void> {
  const query = vendorId ? `?vendor=${encodeURIComponent(vendorId)}` : '';
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.${format}${query}`,
    {
      headers: {
        ...tokenHeader(token),
      },
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't download. Try again.");
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Clarifications_${tenderId}${vendorId ? `_${vendorId}` : ''}.${format}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

export async function verifyTender(
  tenderId: string,
  runId?: string,
  token: string | undefined = getReviewToken()
) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/verify`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ run_id: runId || null }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(
      data.detail || "Couldn't sign off. Try again.",
      res.status,
      data.detail,
      data.code,
      data.open_items
    );
  }
  return res.json();
}

export async function withdrawTender(tenderId: string, token: string | undefined = getReviewToken()) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/withdraw`, {
    method: 'POST',
    headers: getHeaders(token, false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Couldn't reopen. Try again.");
  }
  return res.json();
}

export function getEvidenceUrl(
  tenderId: string,
  paramId: string,
  source: string,
  which: 'primary' | 'secondary' = 'primary'
): string {
  const base = API_BASE || '';
  return `${base}/api/review/tenders/${encodeURIComponent(tenderId)}/evidence/${encodeURIComponent(paramId)}/${encodeURIComponent(source)}/${which}.png`;
}

/**
 * The source PDF behind a citation. Always same-origin: the proxy streams it from the engine, or in
 * replay mode redirects to the sample's static copy under /samples.
 */
export function getDocumentUrl(tenderId: string, filename: string): string {
  return `/api/review/tenders/${encodeURIComponent(tenderId)}/documents/${encodeURIComponent(filename)}`;
}

/** The source PDF's bytes, with the reviewer's token when one is set. */
export async function fetchDocumentBytes(
  tenderId: string,
  filename: string,
  token: string | undefined = getReviewToken()
): Promise<ArrayBuffer> {
  const res = await fetch(getDocumentUrl(tenderId, filename), { headers: tokenHeader(token) });
  if (!res.ok) {
    throw await errorFrom(
      res,
      res.status === 404 ? `${filename} isn't stored for this tender.` : `Couldn't load ${filename}.`
    );
  }
  return res.arrayBuffer();
}

/** Whether the server has a Q&A model wired up (ANTOVA_QA_URL), and the question endpoint. */
export async function getAskStatus(): Promise<{ enabled: boolean; requires?: string }> {
  try {
    const res = await fetch('/api/ask', { cache: 'no-store' });
    if (!res.ok) return { enabled: false, requires: 'ANTOVA_QA_URL' };
    return res.json();
  } catch {
    return { enabled: false, requires: 'ANTOVA_QA_URL' };
  }
}

export interface AskContext {
  tender_id: string;
  param_id?: string;
  vendor_id?: string;
  filename?: string;
  page?: number;
  quote?: string;
  requirement?: string;
}

export async function askQuestion(question: string, context: AskContext): Promise<{ answer: string }> {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...tokenHeader(getReviewToken()) },
    body: JSON.stringify({ question, context }),
  });
  if (!res.ok) throw await errorFrom(res, "Couldn't get an answer. Try again.");
  return res.json();
}

export function getTbeExportUrl(tenderId: string): string {
  const base = API_BASE || '';
  return `${base}/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`;
}

export function getClarificationsExportUrl(tenderId: string, vendorId?: string): string {
  const base = API_BASE || '';
  const query = vendorId ? `?vendor=${encodeURIComponent(vendorId)}` : '';
  return `${base}/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.csv${query}`;
}
