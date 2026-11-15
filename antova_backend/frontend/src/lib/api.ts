import {
  Brief,
  EvaluateResponse,
  Job,
  RatesSettings,
  ReviewRow,
  ReviewPutResponse,
  ReviewTenderRow,
} from './types';
import sample402Raw from './sample402.json';

// Configurable external backend URL via NEXT_PUBLIC_API_URL.
// Defaults to empty string (which uses same-origin Next.js serverless proxy /api/...).
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
export const DEFAULT_REVIEW_TOKEN = process.env.NEXT_PUBLIC_REVIEW_TOKEN || 'dev-review-token-antova';

function getHeaders(token: string = DEFAULT_REVIEW_TOKEN, isJson: boolean = true) {
  const headers: Record<string, string> = {
    'X-Antova-Review-Token': token,
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

/**
 * Intelligent fetcher:
 * 1. Attempts direct request to API_BASE (if configured).
 * 2. If direct cross-origin call fails (e.g. CORS preflight blocked, network error),
 *    automatically fails over to the same-origin Next.js runtime proxy (/api/...).
 */
async function smartFetch(path: string, init?: RequestInit): Promise<Response> {
  const targetUrl = API_BASE ? `${API_BASE}${path}` : path;
  try {
    const res = await fetch(targetUrl, init);
    // If backend returns a 500 or 502 error on direct call, and we have a same-origin proxy, try proxy
    if (!res.ok && res.status >= 500 && API_BASE && path.startsWith('/api/')) {
      console.warn(`Direct call to ${targetUrl} returned ${res.status}. Falling back to internal proxy ${path}...`);
      return await fetch(path, init);
    }
    return res;
  } catch (err) {
    // Network / CORS block on direct fetch: retry through internal same-origin proxy
    if (API_BASE && path.startsWith('/api/')) {
      console.warn(`Direct fetch to ${targetUrl} failed with network/CORS error. Retrying via same-origin proxy ${path}...`);
      return await fetch(path, init);
    }
    throw err;
  }
}

/**
 * Normalizes backend responses from antova-yc to prevent client-side undefined crashes.
 */
export function normalizeBrief(raw: any): Brief {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid brief payload received from backend');
  }

  const tender = raw.tender || {};
  const vendors = Array.isArray(tender.vendors) ? tender.vendors : [];
  const parameters = Array.isArray(tender.parameters) ? tender.parameters : [];

  // Normalize each parameter and its vendor extractions
  const normalizedParameters = parameters.map((param: any) => {
    const rawVendors = param.vendors && typeof param.vendors === 'object' ? param.vendors : {};
    const normalizedVendors: Record<string, any> = {};

    for (const v of vendors) {
      const ext = rawVendors[v.id] || {};
      normalizedVendors[v.id] = {
        extracted_text: ext.extracted_text || '',
        status: ext.status || 'MANUAL_INSPECTION_REQUIRED',
        confidence: typeof ext.confidence === 'number' ? ext.confidence : 1.0,
        bbox: ext.bbox || '',
        snippet: ext.snippet || '',
        conflict_note: ext.conflict_note || null,
        cost_adder: typeof ext.cost_adder === 'number' ? ext.cost_adder : 0,
        adder_formula: ext.adder_formula || '',
        cost_lines: Array.isArray(ext.cost_lines) ? ext.cost_lines : [],
        pricing_status: ext.pricing_status || 'NONE',
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

    return {
      id: param.id || '',
      category: param.category || '',
      name: param.name || '',
      mr_requirement: param.mr_requirement || '',
      pint_rule: param.pint_rule || '',
      criticality: param.criticality || 'MANDATORY',
      vendors: normalizedVendors,
      requirement_citation: param.requirement_citation || null,
      checks_spec: Array.isArray(param.checks_spec) ? param.checks_spec : [],
    };
  });

  // Normalize financials
  const rawFinancials = Array.isArray(raw.financials) ? raw.financials : [];
  const normalizedFinancials = rawFinancials.map((fin: any) => {
    const breakdown = Array.isArray(fin.itemized_breakdown) ? fin.itemized_breakdown : [];
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
      total_adders_low: typeof fin.total_adders_low === 'number' ? fin.total_adders_low : 0,
      total_adders_high: typeof fin.total_adders_high === 'number' ? fin.total_adders_high : 0,
      clawed_back_amount: typeof fin.clawed_back_amount === 'number' ? fin.clawed_back_amount : 0,
      true_evaluated_price: typeof fin.true_evaluated_price === 'number' ? fin.true_evaluated_price : null,
      true_evaluated_low: typeof fin.true_evaluated_low === 'number' ? fin.true_evaluated_low : null,
      true_evaluated_high: typeof fin.true_evaluated_high === 'number' ? fin.true_evaluated_high : null,
      price_status: fin.price_status || 'PRICED',
      itemized_breakdown: breakdown.map((item: any) => ({
        param_id: item.param_id || '',
        param_name: item.param_name || '',
        status: item.status || 'COMPLIANT',
        is_conceded: Boolean(item.is_conceded),
        adder_eur: typeof item.adder_eur === 'number' ? item.adder_eur : 0,
        adder_low_eur: typeof item.adder_low_eur === 'number' ? item.adder_low_eur : 0,
        adder_high_eur: typeof item.adder_high_eur === 'number' ? item.adder_high_eur : 0,
        criticality: item.criticality || 'MANDATORY',
        pricing_status: item.pricing_status || 'NONE',
        is_overridden: Boolean(item.is_overridden),
        override_note: item.override_note || null,
      })),
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
      findings: tender.findings || {},
    },
    financials: normalizedFinancials,
    overrides: Array.isArray(raw.overrides) ? raw.overrides : [],
    open_items: Array.isArray(raw.open_items) ? raw.open_items : [],
    review: raw.review || { open_flags: 0, stale: 0, rejected: 0, reviewed: 0, final: false },
  };
}

export function loadSampleBrief(): Brief {
  return normalizeBrief(sample402Raw);
}

export async function fetchHealth() {
  const res = await smartFetch('/api/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function listTenders(token: string = DEFAULT_REVIEW_TOKEN): Promise<ReviewTenderRow[]> {
  const res = await smartFetch('/api/review/tenders', {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to list tenders: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getTenderBrief(tenderId: string, token: string = DEFAULT_REVIEW_TOKEN): Promise<Brief> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch brief for ${tenderId}: ${res.status} ${res.statusText}`);
  }
  const raw = await res.json();
  return normalizeBrief(raw);
}

export async function uploadTenderFile(
  tenderId: string,
  filename: string,
  fileBytes: Blob | ArrayBuffer,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<{ filename: string; size_bytes: number; sha256: string; pages: number }> {
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/files/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      headers: {
        'X-Antova-Review-Token': token,
        'Content-Type': 'application/pdf',
      },
      body: fileBytes,
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed: ${res.status}`);
  }
  return res.json();
}

export async function listTenderFiles(
  tenderId: string,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<{ files: Array<{ filename: string; size_bytes: number }>; manifest: boolean }> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/files`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to list files: ${res.status}`);
  }
  return res.json();
}

export async function putManifest(
  tenderId: string,
  manifest: Record<string, any>,
  token: string = DEFAULT_REVIEW_TOKEN
) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/manifest`, {
    method: 'PUT',
    headers: getHeaders(token),
    body: JSON.stringify(manifest),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to store manifest: ${res.status}`);
  }
  return res.json();
}

export async function startIngestJob(
  tenderId: string,
  mode: 'replay' | 'auto' | 'live' = 'replay',
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<{ job_id: string; status: string }> {
  const res = await smartFetch('/api/jobs/ingest', {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ tender_id: tenderId, mode }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to queue ingest: ${res.status}`);
  }
  return res.json();
}

export async function getJobStatus(jobId: string, token: string = DEFAULT_REVIEW_TOKEN): Promise<Job> {
  const res = await smartFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch job ${jobId}: ${res.status}`);
  }
  return res.json();
}

export async function evaluateTender(
  tenderId: string,
  rates: RatesSettings,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<EvaluateResponse> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/evaluate`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(rates),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Evaluation failed: ${res.status}`);
  }
  return res.json();
}

export async function putOverride(
  tenderId: string,
  paramId: string,
  vendorId: string,
  adderEur: number | string,
  note: string,
  token: string = DEFAULT_REVIEW_TOKEN
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
    throw new Error(err.detail || `Failed to set override: ${res.status}`);
  }
}

export async function deleteOverride(
  tenderId: string,
  paramId: string,
  vendorId: string,
  token: string = DEFAULT_REVIEW_TOKEN
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
    throw new Error(err.detail || `Failed to delete override: ${res.status}`);
  }
}

export async function submitReviewDecision(
  tenderId: string,
  paramId: string,
  vendorId: string,
  action: 'approve' | 'override' | 'reject',
  note: string,
  token: string = DEFAULT_REVIEW_TOKEN
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
    throw new Error(err.detail || `Review decision failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchEvidenceImageBlob(
  tenderId: string,
  paramId: string,
  source: string,
  which: 'primary' | 'secondary' = 'primary',
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<string> {
  const res = await smartFetch(getEvidenceUrl(tenderId, paramId, source, which), {
    headers: {
      'X-Antova-Review-Token': token,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Evidence retrieval failed: ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function downloadTbeExport(
  tenderId: string,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<void> {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`, {
    headers: {
      'X-Antova-Review-Token': token,
    },
  });
  if (!res.ok) {
    if (res.status === 409) {
      const err = await res.json().catch(() => ({ detail: 'Verify the brief before exporting it' }));
      throw new Error(err.detail || 'Verify the brief before exporting it');
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Export failed: ${res.status}`);
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
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<void> {
  const query = vendorId ? `?vendor=${encodeURIComponent(vendorId)}` : '';
  const res = await smartFetch(
    `/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.${format}${query}`,
    {
      headers: {
        'X-Antova-Review-Token': token,
      },
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Clarifications export failed: ${res.status}`);
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
  token: string = DEFAULT_REVIEW_TOKEN
) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/verify`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ run_id: runId || null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Verification failed: ${res.status}`);
  }
  return res.json();
}

export async function withdrawTender(tenderId: string, token: string = DEFAULT_REVIEW_TOKEN) {
  const res = await smartFetch(`/api/review/tenders/${encodeURIComponent(tenderId)}/withdraw`, {
    method: 'POST',
    headers: getHeaders(token, false),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Withdraw failed: ${res.status}`);
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

export function getTbeExportUrl(tenderId: string): string {
  const base = API_BASE || '';
  return `${base}/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`;
}

export function getClarificationsExportUrl(tenderId: string, vendorId?: string): string {
  const base = API_BASE || '';
  const query = vendorId ? `?vendor=${encodeURIComponent(vendorId)}` : '';
  return `${base}/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.csv${query}`;
}
