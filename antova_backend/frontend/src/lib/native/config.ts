/**
 * Which engine answers /api on this deployment, decided from the environment.
 *
 * 1. BACKEND_URL (or the legacy NEXT_PUBLIC_API_URL) is a usable origin: proxy to that engine.
 * 2. Otherwise, LLM_API_KEY + LLM_MODEL_NAME (+ optional LLM_BASE_URL) are set: the built-in engine
 *    (src/lib/native) runs the ingest inside this Next.js app.
 * 3. Neither: replay mode, the saved sample only.
 *
 * A value pasted from a template ("https://your-backend-url-here", "[PASTE_YOUR_API_KEY_HERE]") is
 * treated as unset, and the health check says it was ignored, so a placeholder can never send the
 * proxy to a host that does not exist.
 *
 * No Next.js imports: scripts/test-proxy.mjs tests this with plain Node.
 */

export type Env = Record<string, string | undefined>;

const PLACEHOLDER = /your[-_ ]|paste[-_ ]|placeholder|changeme|change[-_]me|replace[-_]me|\[|\]|<|>|\.\.\./i;
const RESERVED_HOSTS = /(^|\.)(example\.(com|org|net)|invalid|test)$/i;

/** True for a value copied from a template instead of a real one. */
export function isPlaceholder(value: string | undefined | null): boolean {
  const v = (value || '').trim();
  return v !== '' && PLACEHOLDER.test(v);
}

function envValue(env: Env, name: string): string {
  const v = (env[name] || '').trim();
  return isPlaceholder(v) ? '' : v;
}

/**
 * A real origin for BACKEND_URL: http(s), a host with a dot (or localhost / an IP), not a reserved
 * example domain and not a placeholder. Returns the origin without a trailing slash, else null.
 */
export function usableOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value || isPlaceholder(value) || !/^https?:\/\//i.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith('[');
  if (!isIp && host !== 'localhost' && !host.includes('.')) return null;
  if (RESERVED_HOSTS.test(host)) return null;
  return value.replace(/\/+$/, '');
}

export interface BackendConfig {
  /** The engine origin to proxy to, or null. */
  base: string | null;
  /** BACKEND_URL as set, when it was set but is not usable (a placeholder, no scheme, no real host). */
  ignored?: string;
}

export function backendConfig(env: Env): BackendConfig {
  const raw = (env.BACKEND_URL || env.NEXT_PUBLIC_API_URL || '').trim();
  if (raw) {
    const base = usableOrigin(raw);
    return base ? { base } : { base: null, ignored: raw.slice(0, 120) };
  }
  // Local development talks to a FastAPI engine on its default port, unless the built-in engine is
  // configured: then that one answers, so `next dev` with an LLM key works with nothing else running.
  if (env.NODE_ENV !== 'production' && !llmConfig(env).ok) return { base: 'http://127.0.0.1:8000' };
  return { base: null };
}

export type LlmProvider = 'openai' | 'anthropic';

export interface LlmSettings {
  provider: LlmProvider;
  apiKey: string;
  /** Without a trailing slash. OpenAI-compatible: the URL that /chat/completions hangs off. */
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export type LlmConfigResult = { ok: true; settings: LlmSettings } | { ok: false; missing: string[]; ignored: string[] };

const DEFAULT_OPENAI_BASE = 'https://api.openai.com/v1';

export function llmConfig(env: Env): LlmConfigResult {
  const ignored = ['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL_NAME'].filter((n) => isPlaceholder(env[n]));
  const apiKey = envValue(env, 'LLM_API_KEY');
  const model = envValue(env, 'LLM_MODEL_NAME');
  let baseUrl = envValue(env, 'LLM_BASE_URL') || DEFAULT_OPENAI_BASE;
  const missing = [!apiKey && 'LLM_API_KEY', !model && 'LLM_MODEL_NAME'].filter(Boolean) as string[];
  if (!/^https?:\/\//i.test(baseUrl)) missing.push('LLM_BASE_URL (must start with https://)');
  if (missing.length) return { ok: false, missing, ignored };

  baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
  const provider: LlmProvider = /anthropic\.com/i.test(baseUrl) ? 'anthropic' : 'openai';
  if (provider === 'anthropic') baseUrl = baseUrl.replace(/\/v1(\/messages)?$/, '');
  // One function call must fit inside the route's 60 s limit with room to save the result.
  const requested = Number(env.LLM_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(requested) && requested >= 5_000 ? Math.min(requested, 52_000) : 50_000;
  return { ok: true, settings: { provider, apiKey, baseUrl, model, timeoutMs } };
}

export type EngineMode =
  | { kind: 'proxy'; base: string }
  | { kind: 'native'; llm: LlmSettings; ignoredBackend?: string }
  | { kind: 'replay'; ignoredBackend?: string; missing: string[]; ignored: string[] };

export function engineMode(env: Env): EngineMode {
  const backend = backendConfig(env);
  if (backend.base) return { kind: 'proxy', base: backend.base };
  const llm = llmConfig(env);
  if (llm.ok) return { kind: 'native', llm: llm.settings, ...(backend.ignored ? { ignoredBackend: backend.ignored } : {}) };
  return {
    kind: 'replay',
    missing: llm.missing,
    ignored: llm.ignored,
    ...(backend.ignored ? { ignoredBackend: backend.ignored } : {}),
  };
}

/**
 * The reviewer token that writes to the built-in engine need, or null when writes are open.
 * REVIEW_TOKEN is the same variable the proxy uses for reads; on the built-in engine it guards
 * uploads, ingests (which spend LLM credit) and decisions.
 */
export function nativeWriteToken(env: Env): string | null {
  const t = envValue(env, 'REVIEW_TOKEN') || envValue(env, 'ANTOVA_REVIEW_TOKEN');
  return t || null;
}
