/**
 * Decisions the /api proxy makes, kept free of Next.js imports so scripts/test-proxy.mjs can test
 * them with plain Node.
 *
 * Review token:
 * - The browser never holds a built-in token. There is no default token and no NEXT_PUBLIC_ one.
 * - A reviewer's own token, sent by the browser in X-Antova-Review-Token, is forwarded unchanged.
 * - The server-side REVIEW_TOKEN, when set, is added only to read requests (GET/HEAD) that carry no
 *   token, so anonymous visitors can browse a live backend but cannot write to it. A write without
 *   the reviewer's own token reaches the backend without one and is refused there (401).
 */

export const REVIEW_HEADER = 'X-Antova-Review-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD']);
// `expect` (curl and some clients send 100-continue for large uploads) makes Node's fetch throw.
const HOP_BY_HOP = ['host', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'expect', 'te', 'trailer'];

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * The backend origin to proxy to, or null when none is configured. Outside development there is no
 * localhost default: an unset BACKEND_URL means replay mode, not a request to 127.0.0.1.
 */
export function resolveBackendBase(env: Record<string, string | undefined>): string | null {
  const raw = (env.BACKEND_URL || env.NEXT_PUBLIC_API_URL || '').trim();
  if (raw) {
    return /^https?:\/\//.test(raw) ? raw.replace(/\/+$/, '') : null;
  }
  return env.NODE_ENV === 'production' ? null : 'http://127.0.0.1:8000';
}

export function buildUpstreamHeaders(
  incoming: Headers,
  method: string,
  serverReadToken: string | undefined
): Headers {
  const headers = new Headers(incoming);
  for (const name of HOP_BY_HOP) headers.delete(name);
  if (isSafeMethod(method)) headers.delete('content-length');

  const clientToken = (headers.get(REVIEW_HEADER) || '').trim();
  if (!clientToken) {
    headers.delete(REVIEW_HEADER);
    const token = (serverReadToken || '').trim();
    if (token && isSafeMethod(method)) headers.set(REVIEW_HEADER, token);
  }
  return headers;
}

/**
 * How long the proxy waits for the backend, by route. Uploads and exports move whole files; the
 * rest should answer quickly. Every value stays under the route's maxDuration (60 s).
 */
export function upstreamTimeoutMs(method: string, subPath: string): number {
  const verb = method.toUpperCase();
  if (verb === 'PUT' && /^review\/tenders\/[^/]+\/files\/[^/]+$/.test(subPath)) return 55_000;
  if (/\.(xlsx|csv)$/.test(subPath)) return 30_000;
  if (/\/evidence\/.+\.png$/.test(subPath)) return 20_000;
  if (/\/evaluate$/.test(subPath) || /\/verify$/.test(subPath)) return 20_000;
  return 10_000;
}

/**
 * A backend that could not be reached at all (refused, DNS, reset before any answer) means replay.
 * A backend that was reached but too slow is a 504: it exists, so its sample stand-in would mislead.
 */
export function isTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === 'AbortError' || err.name === 'TimeoutError';
}
