import { NextRequest, NextResponse } from "next/server";
import sample402Raw from "@/lib/sample402.json";
import { replayResponse, type SampleBrief } from "@/lib/replay";
import { buildUpstreamHeaders, resolveBackendBase } from "@/lib/proxy-policy";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const UPSTREAM_TIMEOUT_MS = 4000;

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
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer().catch(() => undefined) : undefined;

  let upstreamResponse: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
  } catch (err: unknown) {
    // Backend unreachable: fall back to the saved sample (reads only; writes get a 405).
    const message = err instanceof Error ? err.message : "Server not responding";
    console.warn(`Upstream unreachable (${targetUrl.origin}): ${message}. Serving replay.`);
    return serveReplay(method, subPath);
  } finally {
    clearTimeout(timeoutId);
  }

  // The backend answered: pass its answer through, including 404 and 5xx. A live backend's error
  // is never replaced by another tender's sample data.
  const responseHeaders = new Headers(upstreamResponse.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("x-antova-source", "live");
  const resBody = await upstreamResponse.arrayBuffer();
  return new NextResponse(resBody, {
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
