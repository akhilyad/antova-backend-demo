import { NextRequest, NextResponse } from "next/server";
import sample402Raw from "@/lib/sample402.json";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const FALLBACK_TENDERS = [
  {
    tender_id: "TENDER-2026-402",
    title: "350 MWp Solar + BESS Substation: 33 kV GIS Switchgear and RTU Protection Package",
    client: "Vogt-Grid EPC Consortium GmbH (Berlin / Madrid)",
    status: "DRAFT",
    open_items_count: 2,
    created_at: "2026-11-13T10:00:00Z",
  },
  {
    tender_id: "TENDER-2026-417",
    title: "500 MW Hybrid Wind/Solar Collector Substation: 33 kV GIS",
    client: "Iberia Renovables S.A.",
    status: "DRAFT",
    open_items_count: 3,
    created_at: "2026-11-14T08:30:00Z",
  },
  {
    tender_id: "TENDER-2026-418",
    title: "200 MW Grid Booster BESS: High Voltage Switchgear",
    client: "TransNet European Infrastructure",
    status: "DRAFT",
    open_items_count: 1,
    created_at: "2026-11-14T11:00:00Z",
  },
];

const REPLAY_HEADERS = {
  "x-antova-source": "replay",
};

function getMockResponse(method: string, subPath: string) {
  // 1. Health check
  if (subPath === "health") {
    return NextResponse.json(
      {
        status: "healthy",
        version: "3.0.0",
        pint_version: "0.26.2",
        mode: "replay",
      },
      { headers: REPLAY_HEADERS }
    );
  }

  // 2. List tenders
  if (subPath === "review/tenders" && method === "GET") {
    return NextResponse.json(FALLBACK_TENDERS, { headers: REPLAY_HEADERS });
  }

  // 3. Review history for tender
  if (subPath.match(/review\/tenders\/[^/]+\/reviews$/) && method === "GET") {
    return NextResponse.json([], { headers: REPLAY_HEADERS });
  }

  // 4. Job status and simulated queue
  if (subPath.startsWith("jobs/ingest") && method === "POST") {
    return NextResponse.json(
      {
        job_id: "job-replay-demo",
        status: "COMPLETED",
        progress_pct: 100,
        stage: "Price",
        result: {
          tender_id: "TENDER-2026-402",
          status: "DRAFT",
        },
      },
      { headers: REPLAY_HEADERS }
    );
  }

  if (subPath.startsWith("jobs/") && method === "GET") {
    const jobId = subPath.replace("jobs/", "");
    return NextResponse.json(
      {
        job_id: jobId,
        status: "COMPLETED",
        progress_pct: 100,
        stage: "Price",
        result: {
          tender_id: "TENDER-2026-402",
          status: "DRAFT",
        },
      },
      { headers: REPLAY_HEADERS }
    );
  }

  // 5. File staging and uploads in replay mode
  if (subPath.match(/review\/tenders\/[^/]+\/files\/[^/]+$/) && method === "PUT") {
    const filename = subPath.split("/").pop() || "document.pdf";
    return NextResponse.json(
      {
        filename,
        size_bytes: 102400,
        sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        pages: 26,
      },
      { status: 201, headers: REPLAY_HEADERS }
    );
  }

  if (subPath.match(/review\/tenders\/[^/]+\/files$/) && method === "GET") {
    return NextResponse.json(
      {
        files: [
          { filename: "MR-33kV-GIS-Rev4.pdf", size_bytes: 102400 },
          { filename: "Bid_vendor-a_Nordwerk.pdf", size_bytes: 85200 },
          { filename: "Bid_vendor-b_VoltSwitch.pdf", size_bytes: 91400 },
          { filename: "Bid_vendor-c_Deltaport.pdf", size_bytes: 88100 },
        ],
        manifest: true,
      },
      { headers: REPLAY_HEADERS }
    );
  }

  if (subPath.match(/review\/tenders\/[^/]+\/manifest$/) && method === "PUT") {
    return NextResponse.json(
      {
        status: "ok",
        message: "Manifest saved (demo mode).",
      },
      { headers: REPLAY_HEADERS }
    );
  }

  // 6. Rate Sensitivity evaluation in replay mode
  if (subPath.match(/review\/tenders\/[^/]+\/evaluate$/) && method === "POST") {
    return NextResponse.json(
      {
        financials: (sample402Raw as any).financials,
        sensitivity_ranges: (sample402Raw as any).sensitivity_ranges || {},
        rank_flip: null,
      },
      { headers: REPLAY_HEADERS }
    );
  }

  // 7. Clarifications CSV export (read-only)
  if (subPath.endsWith("/clarifications.csv")) {
    const csvContent =
      "Bidder ID,Bidder,Requirement ID,Requirement,Offered,Required,Price status,Cost adjustment (EUR)\n" +
      "vendor-b,VoltSwitch Industrial,PARAM-01,Rated Short-Time Withstand Current,31.5 kA,50 kA,PRICED,18500.00\n" +
      "vendor-b,VoltSwitch Industrial,PARAM-06,Incoterms 2020 & Site Unloading,EXW Izmir,DDP Project Site,UNPRICED,\n";
    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="clarifications.csv"',
        ...REPLAY_HEADERS,
      },
    });
  }

  // 8. Single tender brief (sample402 truthful engine snapshot)
  if (subPath.match(/review\/tenders\/[^/]+$/) && method === "GET") {
    return NextResponse.json(sample402Raw, { headers: REPLAY_HEADERS });
  }

  // Disallow fake silent writes for other endpoints in offline replay mode (Defect D4)
  if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
    return NextResponse.json(
      {
        detail:
          "This is sample data and can't be changed. Connect a live server to save decisions and amounts.",
      },
      {
        status: 405,
        headers: REPLAY_HEADERS,
      }
    );
  }

  // Default fallback
  return NextResponse.json(
    {
      status: "ok",
      mode: "replay",
      subPath,
    },
    { headers: REPLAY_HEADERS }
  );
}

async function proxy(request: NextRequest, context: RouteContext) {
  let subPath = "";
  try {
    const resolvedParams = await context.params;
    const pathSegments = resolvedParams?.path || [];
    subPath = pathSegments.join("/");
  } catch {
    subPath = "";
  }

  const rawBackendBase =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000";
  const backendBase = rawBackendBase.replace(/\/$/, "");

  const targetUrl = new URL(
    `/api/${subPath}${request.nextUrl.search}`,
    backendBase.startsWith("http") ? backendBase : "http://127.0.0.1:8000"
  );

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("transfer-encoding");

  // Inject review token into upstream request (Defect D7)
  const configuredReviewToken =
    process.env.REVIEW_TOKEN ||
    process.env.NEXT_PUBLIC_REVIEW_TOKEN ||
    "dev-review-token-antova";
  if (!headers.has("X-Antova-Review-Token")) {
    headers.set("X-Antova-Review-Token", configuredReviewToken);
  }

  const method = request.method;
  const hasBody = !["GET", "HEAD"].includes(method);
  if (!hasBody) {
    headers.delete("content-length");
  }
  const body = hasBody ? await request.arrayBuffer().catch(() => undefined) : undefined;

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

    // If upstream succeeds and is not a 5xx server error, pass it through stamped with live source
    if (upstreamResponse.ok || (upstreamResponse.status < 500 && upstreamResponse.status !== 404)) {
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

    // Upstream returned 5xx or 404 for tender: fall back to replay mode
    console.warn(
      `Upstream ${targetUrl.toString()} returned ${upstreamResponse.status}. Serving verified fallback.`
    );
    return getMockResponse(method, subPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Server not responding";
    console.warn(
      `Upstream unreachable (${targetUrl.toString()}): ${message}. Serving verified fallback.`
    );
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
