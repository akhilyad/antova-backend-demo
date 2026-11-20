import { NextRequest, NextResponse } from "next/server";
import sample402Raw from "@/lib/sample402.json";
import { replayResponse, type SampleBrief } from "@/lib/replay";
import { buildUpstreamHeaders, isTimeout, resolveBackendBase, upstreamTimeoutMs } from "@/lib/proxy-policy";

export const dynamic = "force-dynamic";
// Uploads and exports can take longer than the default function limit.
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

function serveReplay(method: string, subPath: string): NextResponse {
  const result = replayResponse(method, subPath, sample402Raw as SampleBrief);
  if (typeof result.body === "string") {
    return new NextResponse(result.body, { status: result.status, headers: result.headers });
  }
  return NextResponse.json(result.body, { status: result.status, headers: result.headers });
}

async function proxy(request: NextRequest, context: RouteContext) {
  let segments: string[] = [];
  try {
    segments = (await context.params)?.path || [];
  } catch {
    segments = [];
  }
  // "." and ".." would let new URL() climb out of /api/ on the backend.
  if (segments.some((s) => s === "." || s === "..")) {
    return NextResponse.json({ detail: "Invalid path" }, { status: 400 });
  }
  const subPath = segments.map(encodeURIComponent).join("/");
  const method = request.method;

  const backendBase = resolveBackendBase(process.env);
  if (!backendBase) {
    // No backend configured: replay mode, without a doomed request to localhost first.
    return serveReplay(method, subPath);
  }

  const targetUrl = new URL(`/api/${subPath}${request.nextUrl.search}`, backendBase);
  // REVIEW_TOKEN is server-only and is added to reads only (see proxy-policy.ts).
  const headers = buildUpstreamHeaders(request.headers, method, process.env.REVIEW_TOKEN);
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
      console.warn(`Upstream ${method} /api/${subPath} timed out after ${timeoutMs} ms`);
      return NextResponse.json(
        { detail: "The server took too long to answer. Try again in a moment.", code: "upstream_timeout" },
        { status: 504, headers: { "x-antova-source": "live" } }
      );
    }
    // Backend unreachable: fall back to the saved sample (reads only; writes get a 405).
    const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
    const message = (err instanceof Error ? err.message : "Server not responding") + cause;
    console.warn(`Upstream unreachable (${targetUrl.origin}): ${message}. Serving replay.`);
    return serveReplay(method, subPath);
  }
  clearTimeout(timeoutId);

  // The backend answered: pass its answer through, including 404 and 5xx. A live backend's error
  // is never replaced by another tender's sample data.
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("x-antova-source", "live");
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
