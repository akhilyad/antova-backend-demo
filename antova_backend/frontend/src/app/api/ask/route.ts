import { NextRequest, NextResponse } from "next/server";
import { REVIEW_HEADER, resolveBackendBase } from "@/lib/proxy-policy";
import { engineMode, nativeWriteToken } from "@/lib/native/config";
import { chatText } from "@/lib/native/llm";

/**
 * Evidence Inspector "Ask AI": a question about one cited clause, answered by a Q&A service.
 *
 * Neither engine (antova-yc or this benchmark) has a Q&A endpoint, so this route forwards to the
 * service named by ANTOVA_QA_URL (server-only). Unset means the feature is off: GET says so and the
 * Inspector disables the button with a tooltip naming the variable.
 *
 * Contract with the Q&A service:
 *   POST ANTOVA_QA_URL   { question, context: { tender_id, param_id?, vendor_id?, filename?, page?, quote?, requirement? } }
 *   → 200 { answer: string }
 * ANTOVA_QA_TOKEN, when set, is sent as `Authorization: Bearer <token>`.
 *
 * A paid model must not be open to every visitor: when an engine is configured, the caller's
 * reviewer token is checked against it first (a token-gated read of the tender). With no engine,
 * questions are refused unless ANTOVA_QA_PUBLIC=1.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_QUESTION = 2000;
const QA_TIMEOUT_MS = 45_000;

function qaUrl(): string | null {
  const raw = (process.env.ANTOVA_QA_URL || "").trim();
  return /^https?:\/\//.test(raw) ? raw : null;
}

/** The built-in engine's model, when no Q&A service is named and an LLM is configured. */
function nativeModel() {
  if (qaUrl()) return null;
  const mode = engineMode(process.env);
  return mode.kind === "native" ? mode.llm : null;
}

export async function GET() {
  return NextResponse.json({ enabled: qaUrl() !== null || nativeModel() !== null, requires: "ANTOVA_QA_URL or LLM_API_KEY" });
}

type AskBody = {
  question?: unknown;
  context?: Record<string, unknown>;
};

async function reviewerAllowed(request: NextRequest, tenderId: string): Promise<boolean> {
  const backend = resolveBackendBase(process.env);
  if (!backend) return process.env.ANTOVA_QA_PUBLIC === "1";
  const token = (request.headers.get(REVIEW_HEADER) || "").trim();
  if (!token) return false;
  try {
    // A cheap token-gated read (the file list). FastAPI's GET routes don't take HEAD, and a 405 is
    // answered before the token is checked, so GET it is.
    const res = await fetch(new URL(`/api/review/tenders/${encodeURIComponent(tenderId)}/files`, backend), {
      headers: { [REVIEW_HEADER]: token },
      signal: AbortSignal.timeout(8000),
    });
    await res.body?.cancel();
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const url = qaUrl();
  const llm = nativeModel();
  if (!url && !llm) {
    return NextResponse.json(
      { detail: "Ask AI is off: set ANTOVA_QA_URL on the server to a Q&A service.", code: "qa_not_configured" },
      { status: 501 }
    );
  }

  let body: AskBody;
  try {
    body = (await request.json()) as AskBody;
  } catch {
    return NextResponse.json({ detail: "Send JSON: { question, context }." }, { status: 400 });
  }
  const question = typeof body.question === "string" ? body.question.trim() : "";
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const tenderId = typeof context.tender_id === "string" ? context.tender_id : "";
  if (!question || question.length > MAX_QUESTION) {
    return NextResponse.json({ detail: `Ask a question of 1 to ${MAX_QUESTION} characters.` }, { status: 422 });
  }
  if (!tenderId) {
    return NextResponse.json({ detail: "context.tender_id is required." }, { status: 422 });
  }

  const allowed = llm
    ? (() => {
        // Built-in engine: the same rule as its writes. Open unless REVIEW_TOKEN is set.
        const need = nativeWriteToken(process.env);
        return !need || (request.headers.get(REVIEW_HEADER) || "").trim() === need;
      })()
    : await reviewerAllowed(request, tenderId);
  if (!allowed) {
    return NextResponse.json(
      { detail: "Ask AI needs your reviewer token. Add it under Settings.", code: "qa_needs_token" },
      { status: 401 }
    );
  }

  if (llm) {
    try {
      const answer = await chatText(
        llm,
        "You help a procurement engineer review a bid against a buyer's specification for MV switchgear. Answer only from the context given; say so when it does not contain the answer. Two to five sentences, plain language.",
        `Question: ${question}\n\nContext (JSON): ${JSON.stringify(context).slice(0, 6000)}`
      );
      return NextResponse.json({ answer });
    } catch (err) {
      console.warn(JSON.stringify({ event: "qa_native_error", error: err instanceof Error ? err.message.slice(0, 200) : "unknown" }));
      return NextResponse.json({ detail: "The model didn't answer. Try again." }, { status: 502 });
    }
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const qaToken = (process.env.ANTOVA_QA_TOKEN || "").trim();
  if (qaToken) headers.Authorization = `Bearer ${qaToken}`;

  try {
    const res = await fetch(url!, {
      method: "POST",
      headers,
      body: JSON.stringify({ question, context }),
      signal: AbortSignal.timeout(QA_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof data.answer !== "string") {
      console.warn(JSON.stringify({ event: "qa_error", status: res.status }));
      return NextResponse.json({ detail: "The Q&A service didn't answer. Try again." }, { status: 502 });
    }
    return NextResponse.json({ answer: data.answer });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return NextResponse.json(
      { detail: timeout ? "The Q&A service took too long." : "The Q&A service is unreachable." },
      { status: timeout ? 504 : 502 }
    );
  }
}
