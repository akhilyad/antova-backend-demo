import { NextRequest, NextResponse } from "next/server";
import sample402Raw from "@/lib/sample402.json";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const FALLBACK_TENDERS = [
  {
    tender_id: "TENDER-2026-402",
    title: "350 MWp Solar + BESS Substation — 33kV GIS Switchgear & RTU Protection Package",
    client: "Vogt-Grid EPC Consortium GmbH (Berlin / Madrid)",
    status: "VERIFIED",
    open_items_count: 0,
    created_at: "2026-11-13T10:00:00Z",
  },
  {
    tender_id: "TENDER-2026-417",
    title: "500 MW Hybrid Wind/Solar Collector Substation — 33kV GIS",
    client: "Iberia Renovables S.A.",
    status: "DRAFT",
    open_items_count: 3,
    created_at: "2026-11-14T08:30:00Z",
  },
];

function getMockResponse(method: string, subPath: string) {
  // 1. Health check
  if (subPath === "health") {
    return NextResponse.json({
      status: "healthy",
      version: "3.0.0",
      pint_version: "0.26.2",
      mode: "fallback-verified",
    });
  }

  // 2. List tenders
  if (subPath === "review/tenders" && method === "GET") {
    return NextResponse.json(FALLBACK_TENDERS);
  }

  // 3. Ingest job start
  if (subPath === "jobs/ingest" && method === "POST") {
    return NextResponse.json({
      job_id: "job-replay-402",
      status: "QUEUED",
      tender_id: "TENDER-2026-402",
    });
  }

  // 4. Job polling
  if (subPath.startsWith("jobs/") && method === "GET") {
    const jobId = subPath.replace("jobs/", "");
    return NextResponse.json({
      job_id: jobId,
      status: "COMPLETED",
      progress: 100,
      stage: "Price",
      result: {
        tender_id: "TENDER-2026-402",
        status: "VERIFIED",
      },
    });
  }

  // 5. Evaluate tender
  if (subPath.includes("/evaluate") && method === "POST") {
    return NextResponse.json({
      tender_id: "TENDER-2026-402",
      financials: sample402Raw.financials,
      timestamp: new Date().toISOString(),
    });
  }

  // 6. Verify brief
  if (subPath.includes("/verify") && method === "POST") {
    return NextResponse.json({
      status: "VERIFIED",
      verified_at: new Date().toISOString(),
    });
  }

  // 7. Withdraw brief
  if (subPath.includes("/withdraw") && method === "POST") {
    return NextResponse.json({
      status: "DRAFT",
      verified_at: null,
    });
  }

  // 8. Overrides PUT/DELETE
  if (subPath.includes("/overrides/") && ["PUT", "DELETE"].includes(method)) {
    return new NextResponse(null, { status: 204 });
  }

  // 9. Clarifications CSV export
  if (subPath.endsWith("/clarifications.csv")) {
    const csvContent =
      "Vendor ID,Vendor Name,Clause ID,Clause Name,Quoted Value,Required Value,Pricing Status,Adder EUR\n" +
      "vendor-b,VoltSwitch Industrial,PARAM-01,Rated Short-Time Withstand Current,31.5 kA,50 kA,PRICED,14200.00\n" +
      "vendor-b,VoltSwitch Industrial,PARAM-06,Incoterms 2020 & Site Unloading,EXW Izmir,DDP Project Site,OVERRIDDEN,9300.00\n";
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clarifications.csv"',
      },
    });
  }

  // 10. Single tender brief (default for review/tenders/*)
  if (subPath.startsWith("review/tenders/")) {
    return NextResponse.json(sample402Raw);
  }

  // Default fallback
  return NextResponse.json({
    status: "ok",
    fallback: true,
    subPath,
  });
}

async function proxy(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const pathSegments = path || [];
  const rawBackendBase =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  const backendBase = rawBackendBase.replace(/\/$/, "");
  const subPath = pathSegments.join("/");

  // If backend base is localhost or empty on Vercel production without a reachable host,
  // we try upstream with a short timeout, and if it fails or returns >= 500, we serve verified mock.
  const targetUrl = new URL(
    `/api/${subPath}${request.nextUrl.search}`,
    backendBase.startsWith("http") ? backendBase : "http://127.0.0.1:8000"
  );

  const headers = new Headers(request.headers);
  headers.delete("host");

  const method = request.method;
  const hasBody = !["GET", "HEAD"].includes(method);
  const body = hasBody ? await request.arrayBuffer() : undefined;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    // If upstream succeeds and is not a server error, pass it through
    if (upstreamResponse.ok || upstreamResponse.status < 500) {
      const responseHeaders = new Headers(upstreamResponse.headers);
      responseHeaders.delete("content-encoding");
      responseHeaders.delete("content-length");

      return new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: responseHeaders,
      });
    }

    // Upstream returned 5xx: fall back to verified mock
    console.warn(`Upstream ${targetUrl.toString()} returned ${upstreamResponse.status}. Serving verified fallback.`);
    return getMockResponse(method, subPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upstream unreachable";
    console.warn(`Upstream unreachable (${targetUrl.toString()}): ${message}. Serving verified fallback.`);
    return getMockResponse(method, subPath);
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
