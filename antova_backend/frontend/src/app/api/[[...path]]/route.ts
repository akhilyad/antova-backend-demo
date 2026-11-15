import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathSegments = path || [];
  const backendBase = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const subPath = pathSegments.join("/");
  const targetUrl = new URL(
    `/api/${subPath}${request.nextUrl.search}`,
    backendBase
  );

  const headers = new Headers(request.headers);
  headers.delete("host");

  const method = request.method;
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstreamResponse.headers);
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");

    return new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Upstream backend unreachable";
    return NextResponse.json(
      { error: "Backend proxy error", detail: message },
      { status: 502 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
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
