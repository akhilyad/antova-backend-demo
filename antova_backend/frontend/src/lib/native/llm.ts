/**
 * The built-in engine's model client: OpenAI-compatible /chat/completions (OpenAI, Azure-style
 * gateways, OpenRouter, Together, Groq, DeepSeek, Mistral, Gemini's OpenAI endpoint, vLLM, Ollama...)
 * or Anthropic's /v1/messages when LLM_BASE_URL points at api.anthropic.com. Plain fetch, no SDK.
 *
 * Every answer is asked for as one JSON object and parsed here; a reply that is not JSON is an
 * error, never a guess.
 */
import type { LlmSettings } from './config.ts';

export class LlmError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export interface LlmUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JsonAnswer {
  data: Record<string, unknown>;
  usage: LlmUsage;
}

function host(settings: LlmSettings): string {
  try {
    return new URL(settings.baseUrl).host;
  } catch {
    return settings.baseUrl;
  }
}

/** The provider's own error message, short, without echoing anything that looks like a key. */
async function providerMessage(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  let message = text;
  try {
    const body = JSON.parse(text);
    message = body?.error?.message || body?.error?.type || body?.message || body?.detail || text;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {
    // not JSON: keep the text
  }
  return message.replace(/(sk|key|tok)[-_A-Za-z0-9]{12,}/g, '[redacted]').replace(/\s+/g, ' ').slice(0, 240);
}

/** The first JSON object in a reply, with or without a ```json fence. */
export function parseJsonObject(text: string): Record<string, unknown> {
  let body = text.trim();
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) throw new LlmError('The model did not answer with JSON.', 200);
  try {
    const parsed = JSON.parse(body.slice(start, end + 1));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new LlmError('The model answered with JSON that does not parse.', 200);
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
    throw new LlmError(
      timeout ? `The model took longer than ${Math.round(timeoutMs / 1000)} s to answer.` : `The model could not be reached${cause}.`
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function openAiJson(settings: LlmSettings, system: string, user: string, maxTokens: number): Promise<JsonAnswer> {
  const url = `${settings.baseUrl}/chat/completions`;
  const headers = { Authorization: `Bearer ${settings.apiKey}` };
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  // Providers differ on what they accept: reasoning models refuse temperature and max_tokens, some
  // gateways refuse response_format. Each variant is tried once, only after a 400 about the request.
  const variants: Record<string, unknown>[] = [
    { temperature: 0, max_tokens: maxTokens, response_format: { type: 'json_object' } },
    { max_completion_tokens: maxTokens, response_format: { type: 'json_object' } },
    { max_tokens: maxTokens },
    {},
  ];
  const started = Date.now();
  let lastError = '';
  for (let i = 0; i < variants.length; i++) {
    const remaining = settings.timeoutMs - (Date.now() - started);
    if (remaining < 3_000) break;
    let res = await post(url, headers, { model: settings.model, messages, ...variants[i] }, remaining);
    if (res.status === 429 || res.status >= 500) {
      await res.body?.cancel();
      await sleep(1500);
      const left = settings.timeoutMs - (Date.now() - started);
      if (left < 3_000) throw new LlmError(`The model at ${host(settings)} is busy (${res.status}). Try again.`, res.status);
      res = await post(url, headers, { model: settings.model, messages, ...variants[i] }, left);
    }
    if (res.status === 400 || res.status === 422) {
      lastError = await providerMessage(res);
      continue;
    }
    if (!res.ok) {
      throw new LlmError(`The model at ${host(settings)} answered ${res.status}: ${await providerMessage(res)}`, res.status);
    }
    const body = (await res.json().catch(() => null)) as any;
    const content = body?.choices?.[0]?.message?.content;
    const text = Array.isArray(content) ? content.map((c: any) => c?.text || '').join('') : String(content ?? '');
    if (!text.trim()) throw new LlmError(`The model at ${host(settings)} sent an empty answer.`, 200);
    return {
      data: parseJsonObject(text),
      usage: {
        input_tokens: Number(body?.usage?.prompt_tokens) || 0,
        output_tokens: Number(body?.usage?.completion_tokens) || 0,
      },
    };
  }
  throw new LlmError(`The model at ${host(settings)} refused the request: ${lastError || 'no answer'}`, 400);
}

async function anthropicJson(settings: LlmSettings, system: string, user: string, maxTokens: number): Promise<JsonAnswer> {
  const headers = { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' };
  const body = {
    model: settings.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  };
  let res = await post(`${settings.baseUrl}/v1/messages`, headers, body, settings.timeoutMs);
  if (res.status === 429 || res.status === 529 || res.status >= 500) {
    await res.body?.cancel();
    await sleep(1500);
    res = await post(`${settings.baseUrl}/v1/messages`, headers, body, Math.max(5_000, settings.timeoutMs - 3_000));
  }
  if (!res.ok) throw new LlmError(`The model at ${host(settings)} answered ${res.status}: ${await providerMessage(res)}`, res.status);
  const data = (await res.json().catch(() => null)) as any;
  const text = Array.isArray(data?.content) ? data.content.map((c: any) => (c?.type === 'text' ? c.text : '')).join('') : '';
  if (!text.trim()) throw new LlmError(`The model at ${host(settings)} sent an empty answer.`, 200);
  return {
    data: parseJsonObject(text),
    usage: { input_tokens: Number(data?.usage?.input_tokens) || 0, output_tokens: Number(data?.usage?.output_tokens) || 0 },
  };
}

/** One JSON object from the model for `system` + `user`. Throws LlmError with a reason a person can act on. */
export function chatJson(settings: LlmSettings, system: string, user: string, maxTokens = 4096): Promise<JsonAnswer> {
  return settings.provider === 'anthropic'
    ? anthropicJson(settings, system, user, maxTokens)
    : openAiJson(settings, system, user, maxTokens);
}

/** One short plain-text answer (the Evidence Inspector's "Ask AI"). */
export async function chatText(settings: LlmSettings, system: string, user: string, maxTokens = 600): Promise<string> {
  const wrapped = `${user}\n\nAnswer as JSON: {"answer": "<your answer>"}`;
  const { data } = await chatJson(settings, system, wrapped, maxTokens);
  return typeof data.answer === 'string' ? data.answer : JSON.stringify(data);
}

export interface LlmProbe {
  ok: boolean;
  status: number;
  detail: string;
  latency_ms: number;
}

let cachedProbe: { key: string; at: number; probe: LlmProbe } | null = null;

/**
 * Whether the configured model answers: the provider's model list first (free), then, if that route
 * does not exist or does not list the model, a one-word completion. Cached 60 s on success and 15 s
 * on failure so a page that polls health does not spend tokens.
 */
export async function probeLlm(settings: LlmSettings): Promise<LlmProbe> {
  const key = `${settings.provider}|${settings.baseUrl}|${settings.model}|${settings.apiKey.slice(-6)}`;
  if (cachedProbe && cachedProbe.key === key && Date.now() - cachedProbe.at < (cachedProbe.probe.ok ? 60_000 : 15_000)) {
    return cachedProbe.probe;
  }
  const started = Date.now();
  const finish = (ok: boolean, status: number, detail: string): LlmProbe => {
    const probe = { ok, status, detail, latency_ms: Date.now() - started };
    cachedProbe = { key, at: Date.now(), probe };
    return probe;
  };

  const listUrl = settings.provider === 'anthropic' ? `${settings.baseUrl}/v1/models` : `${settings.baseUrl}/models`;
  const listHeaders: Record<string, string> =
    settings.provider === 'anthropic'
      ? { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${settings.apiKey}` };
  try {
    const res = await fetch(listUrl, { headers: listHeaders, signal: AbortSignal.timeout(8_000) });
    if (res.status === 401 || res.status === 403) {
      return finish(false, res.status, `The model provider at ${host(settings)} refused the API key (${res.status}): ${await providerMessage(res)}`);
    }
    if (res.ok) {
      const body = (await res.json().catch(() => ({}))) as any;
      const ids: string[] = Array.isArray(body?.data) ? body.data.map((m: any) => String(m?.id ?? '')) : [];
      if (ids.length === 0 || ids.some((id) => id === settings.model || id.endsWith(`/${settings.model}`))) {
        return finish(true, 200, `Model ${settings.model} at ${host(settings)} is available.`);
      }
    } else {
      await res.body?.cancel();
    }
  } catch (err) {
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : err instanceof Error ? err.message : '';
    return finish(false, 0, `The model provider at ${host(settings)} could not be reached (${cause.slice(0, 160)}).`);
  }

  // No model list, or the model is not in it: one tiny completion settles it.
  try {
    const quick = { ...settings, timeoutMs: 15_000 };
    await chatJson(quick, 'Reply with JSON only.', 'Return {"ok": true}.', 16);
    return finish(true, 200, `Model ${settings.model} at ${host(settings)} answered.`);
  } catch (err) {
    const status = err instanceof LlmError ? err.status : 0;
    // 200: it answered, only not in the shape asked for (say, a reasoning model out of tokens). It works.
    if (status === 200) return finish(true, 200, `Model ${settings.model} at ${host(settings)} answered.`);
    return finish(false, status, err instanceof Error ? err.message : 'The model did not answer.');
  }
}
