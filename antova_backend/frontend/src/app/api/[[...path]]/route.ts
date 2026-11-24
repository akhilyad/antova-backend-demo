import { NextRequest, NextResponse } from "next/server";
import sample402Raw from "@/lib/sample402.json";
import { replayResponse, type ReplayDiagnostic, type SampleBrief } from "@/lib/replay";
import {
  REQUEST_ID_HEADER,
  buildUpstreamHeaders,
  isTimeout,
  resolveRequestId,
  upstreamTimeoutMs,
} from "@/lib/proxy-policy";
import { engineMode } from "@/lib/native/config";
import { handleNative } from "@/lib/native/handler";

export const dynamic = "force-dynamic";
// Uploads and exports can take longer than the default function limit.
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function serveReplay(method: string, subPath: string, requestId: string, diagnostic?: ReplayDiagnostic): NextResponse {
  const result = replayResponse(method, subPath, sample402Raw as SampleBrief, diagnostic);
  const headers = { ...result.headers, [REQUEST_ID_HEADER]: requestId };
  if (typeof result.body === "string") {
    return new NextResponse(result.body, { status: result.status, headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}

async function proxy(request: NextRequest, context: RouteContext) {
  let segments: string[] = [];
  try {
    segments = (await context.params)?.path || [];
  } catch {
    segments = [];
  }
  // "." and ".." would let new URL() climb out of /api/ on the backend.
  const requestId = resolveRequestId(request.headers.get(REQUEST_ID_HEADER), newRequestId);
  if (segments.some((s) => s === "." || s === "..")) {
    return NextResponse.json({ detail: "Invalid path" }, { status: 400, headers: { [REQUEST_ID_HEADER]: requestId } });
  }
  const subPath = segments.map(encodeURIComponent).join("/");
  const method = request.method;

  const mode = engineMode(process.env);
  if (mode.kind === "native") {
    // No external engine, but an LLM is configured: the built-in engine answers (src/lib/native).
    return handleNative(request, segments, mode, requestId);
  }
  if (mode.kind === "replay") {
    // Nothing configured: replay mode, without a doomed request to localhost first.
    const notes = [
      mode.ignoredBackend ? `BACKEND_URL "${mode.ignoredBackend}" is a placeholder or not a real origin, so it is ignored.` : "",
      mode.ignored.length ? `${mode.ignored.join(", ")} still hold template placeholders.` : "",
      `To process files here, set ${mode.missing.join(" and ")} (the built-in engine), or BACKEND_URL to a running engine.`,
    ].filter(Boolean);
    return serveReplay(method, subPath, requestId, { reason: "not_configured", error: notes.join(" ") });
  }
  const backendBase = mode.base;

  const targetUrl = new URL(`/api/${subPath}${request.nextUrl.search}`, backendBase);
  // REVIEW_TOKEN is server-only and is added to reads only (see proxy-policy.ts).
  const headers = buildUpstreamHeaders(request.headers, method, process.env.REVIEW_TOKEN);
  headers.set(REQUEST_ID_HEADER, requestId);
  const hasBody = !["GET", "HEAD"].includes(method) && request.body !== null;

  let upstreamResponse: Response;
  const controller = new AbortController();
  const timeoutMs = upstreamTimeoutMs(method, subPath);
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      // Streamed, not buffered: a large PDF is not held in memory twice.
      body: hasBody ? request.body : undefined,
      // Required by Node's fetch when the body is a stream.
      ...(hasBody ? { duplex: "half" } : {}),
      redirect: "manual",
      signal: controller.signal,
    } as RequestInit);
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (isTimeout(err)) {
      console.warn(JSON.stringify({ event: "upstream_timeout", request_id: requestId, method, path: `/api/${subPath}`, timeout_ms: timeoutMs }));
      return NextResponse.json(
        { detail: "The server took too long to answer. Try again in a moment.", code: "upstream_timeout" },
        { status: 504, headers: { "x-antova-source": "live", [REQUEST_ID_HEADER]: requestId } }
      );
    }
    // Backend unreachable: fall back to the saved sample (reads only; writes get a 405).
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    const message = (err instanceof Error ? err.message : "Server not responding") + cause;
    console.warn(JSON.stringify({ event: "upstream_unreachable", request_id: requestId, method, path: `/api/${subPath}`, error: message }));
    return serveReplay(method, subPath, requestId, {
      reason: "unreachable",
      backend: new URL(backendBase).origin,
      error: message.slice(0, 200),
    });
  }
  clearTimeout(timeoutId);

  // The backend answered: pass its answer through, including 404 and 5xx. A live backend's error
  // is never replaced by another tender's sample data.
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("x-antova-source", "live");
  // The engine echoes the ID; set it anyway in case an older engine does not.
  if (!responseHeaders.has(REQUEST_ID_HEADER)) responseHeaders.set(REQUEST_ID_HEADER, requestId);
  if (upstreamResponse.status >= 500) {
    console.warn(JSON.stringify({ event: "upstream_error", request_id: requestId, method, path: `/api/${subPath}`, status: upstreamResponse.status }));
  }
  // Streamed back as it arrives (exports and evidence images are not buffered here).
  return new NextResponse(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxy(request, context);
}
