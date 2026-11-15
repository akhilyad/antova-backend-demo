import {
  Brief,
  EvaluateResponse,
  Job,
  RatesSettings,
  ReviewRow,
  ReviewPutResponse,
  ReviewTenderRow,
} from './types';

const API_BASE = ''; // proxied via next.config.ts rewrites to http://127.0.0.1:8000
export const DEFAULT_REVIEW_TOKEN = 'dev-review-token-antova';

function getHeaders(token: string = DEFAULT_REVIEW_TOKEN, isJson: boolean = true) {
  const headers: Record<string, string> = {
    'X-Antova-Review-Token': token,
  };
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function listTenders(token: string = DEFAULT_REVIEW_TOKEN): Promise<ReviewTenderRow[]> {
  const res = await fetch(`${API_BASE}/api/review/tenders`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to list tenders: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function getTenderBrief(tenderId: string, token: string = DEFAULT_REVIEW_TOKEN): Promise<Brief> {
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch brief for ${tenderId}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function uploadTenderFile(
  tenderId: string,
  filename: string,
  fileBytes: Blob | ArrayBuffer,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<{ filename: string; size_bytes: number; sha256: string; pages: number }> {
  const res = await fetch(
    `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/files/${encodeURIComponent(filename)}`,
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/files`, {
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/manifest`, {
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
  const res = await fetch(`${API_BASE}/api/jobs/ingest`, {
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
  const res = await fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`, {
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/evaluate`, {
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
  adderEur: string,
  note: string,
  token: string = DEFAULT_REVIEW_TOKEN
) {
  const res = await fetch(
    `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/overrides/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
    {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ adder_eur: adderEur, note }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Override failed: ${res.status}`);
  }
}

export async function deleteOverride(
  tenderId: string,
  paramId: string,
  vendorId: string,
  token: string = DEFAULT_REVIEW_TOKEN
) {
  const res = await fetch(
    `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/overrides/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
    {
      method: 'DELETE',
      headers: getHeaders(token, false),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Delete override failed: ${res.status}`);
  }
}

export async function listReviews(
  tenderId: string,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<ReviewRow[]> {
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/reviews`, {
    headers: getHeaders(token),
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to list reviews: ${res.status}`);
  }
  return res.json();
}

export async function putReviewDecision(
  tenderId: string,
  paramId: string,
  vendorId: string,
  action: 'approve' | 'override' | 'reject',
  note: string,
  token: string = DEFAULT_REVIEW_TOKEN
): Promise<ReviewPutResponse> {
  const res = await fetch(
    `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/reviews/${encodeURIComponent(paramId)}/${encodeURIComponent(vendorId)}`,
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
  const res = await fetch(getEvidenceUrl(tenderId, paramId, source, which), {
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`, {
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
  const res = await fetch(
    `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.${format}${query}`,
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/verify`, {
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
  const res = await fetch(`${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/withdraw`, {
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
  return `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/evidence/${encodeURIComponent(paramId)}/${encodeURIComponent(source)}/${which}.png`;
}

export function getTbeExportUrl(tenderId: string): string {
  return `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/export-tbe.xlsx`;
}

export function getClarificationsExportUrl(tenderId: string, vendorId?: string): string {
  const query = vendorId ? `?vendor=${encodeURIComponent(vendorId)}` : '';
  return `${API_BASE}/api/review/tenders/${encodeURIComponent(tenderId)}/clarifications.csv${query}`;
}
