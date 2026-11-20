/**
 * Replay mode: what the /api proxy answers when no live backend is reachable.
 *
 * Rules:
 * - Only the tenders in SAMPLE_TENDER_IDS have saved data. Any other tender ID is a 404, never
 *   another tender's brief.
 * - Nothing is written in replay mode. Every write (upload, manifest, ingest, review, override,
 *   verify) answers 405 with a message saying a live server is needed. No fake success.
 * - Unknown paths are a 404, not a generic "ok".
 *
 * This module has no imports (the sample brief is passed in) so it can be unit tested with plain
 * Node: see scripts/test-proxy.mjs.
 */

export const SAMPLE_TENDER_IDS: ReadonlySet<string> = new Set(['TENDER-2026-402']);

export const REPLAY_HEADERS: Readonly<Record<string, string>> = { 'x-antova-source': 'replay' };

export const READ_ONLY_DETAIL =
  "This deployment shows saved sample data and can't save anything. Connect a live server to upload documents, run ingests or record decisions.";

export const RECALC_DETAIL =
  "Recalculating totals needs a live server. The preview shows the change using the engine's formula.";

export interface ReplayResult {
  status: number;
  /** JSON-serialisable body, or a string for non-JSON content. */
  body: unknown;
  headers: Record<string, string>;
}

export interface SampleBrief {
  share_id?: string;
  status?: string;
  verified_at?: string | null;
  tender?: { id?: string; title?: string; client?: string };
  financials?: unknown;
  open_items?: unknown[];
  documents?: { file?: string; filename?: string; size_bytes?: number }[];
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

function json(status: number, body: unknown, extra: Record<string, string> = {}): ReplayResult {
  return { status, body, headers: { ...REPLAY_HEADERS, ...extra } };
}

function notFound(subPath: string): ReplayResult {
  return json(404, {
    detail: 'Not found in the saved sample data.',
    code: 'not_in_sample',
    path: subPath,
  });
}

function sampleRow(sample: SampleBrief) {
  const openItems = Array.isArray(sample.open_items) ? sample.open_items.length : 0;
  return {
    tender_id: sample.tender?.id ?? 'TENDER-2026-402',
    title: sample.tender?.title ?? '',
    client: sample.tender?.client ?? '',
    status: sample.status ?? 'DRAFT',
    share_id: sample.share_id ?? null,
    verified_at: sample.verified_at ?? null,
    open_items: openItems,
    open_items_count: openItems,
  };
}

/** `review/tenders/<id>[/<rest>]` → { tenderId, rest }, else null. */
function parseTenderPath(subPath: string): { tenderId: string; rest: string } | null {
  const m = subPath.match(/^review\/tenders\/([^/]+)(?:\/(.*))?$/);
  if (!m) return null;
  let tenderId = m[1];
  try {
    tenderId = decodeURIComponent(tenderId);
  } catch {
    // keep the raw segment; it will simply not match a sample ID
  }
  return { tenderId, rest: m[2] ?? '' };
}

export function replayResponse(method: string, subPath: string, sample: SampleBrief): ReplayResult {
  const verb = method.toUpperCase();

  if (subPath === 'health' && (verb === 'GET' || verb === 'HEAD')) {
    // Not "healthy": the engine is not connected. The UI reads `mode` to say so.
    return json(200, { status: 'degraded', mode: 'replay', engine: 'not connected', version: '3.0.0' });
  }

  if (subPath === 'review/tenders' && verb === 'GET') {
    return json(200, [sampleRow(sample)]);
  }

  const tenderPath = parseTenderPath(subPath);
  const isSample = tenderPath !== null && SAMPLE_TENDER_IDS.has(tenderPath.tenderId);

  // Recalculating needs the engine. Returning the saved totals here would show them as if they
  // had been computed at the new rates.
  if (tenderPath && tenderPath.rest === 'evaluate' && verb === 'POST') {
    if (!isSample) return notFound(subPath);
    return json(405, { detail: RECALC_DETAIL, code: 'replay_no_recalc' });
  }

  if (WRITE_METHODS.has(verb)) {
    return json(405, { detail: READ_ONLY_DETAIL, code: 'replay_read_only' });
  }

  if (verb !== 'GET' && verb !== 'HEAD') {
    return json(405, { detail: READ_ONLY_DETAIL, code: 'replay_read_only' });
  }

  if (!tenderPath || !isSample) {
    return notFound(subPath);
  }

  switch (tenderPath.rest) {
    case '':
      return json(200, sample);
    case 'reviews':
      return json(200, []);
    case 'files': {
      const docs = Array.isArray(sample.documents) ? sample.documents : [];
      return json(200, {
        files: docs
          .map((d) => ({ filename: d.file ?? d.filename ?? '', size_bytes: d.size_bytes ?? null }))
          .filter((d) => d.filename),
        manifest: true,
      });
    }
    default:
      // Evidence crops, exports and anything else were never saved in the sample.
      return notFound(subPath);
  }
}
