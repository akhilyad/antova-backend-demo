# Built-in engine: `/ingest` with no engine host

Written 2026-11-24 with branch `feat/native-llm-engine`.

The workbench can now process a tender inside the Next.js app itself, so the Vercel deploy works
with no FastAPI engine running anywhere. It answers the same `/api` routes with the same JSON as the
FastAPI engine, so the dashboard, Evidence Inspector, overrides, reviews and sign-off work unchanged.

## Which engine answers `/api`

Decided per request from the environment (`src/lib/native/config.ts`):

1. `BACKEND_URL` is a real origin: proxy to that engine (unchanged behaviour).
2. Otherwise `LLM_API_KEY` + `LLM_MODEL_NAME` are set: the built-in engine (`src/lib/native/`).
3. Neither: replay mode, the saved sample only.

A template value is treated as unset: `https://your-backend-url-here`, `[PASTE_…]`, `<…>`,
`example.com`, or a host with no dot. `/api/health` names what it ignored. This is what caused the
live site's `getaddrinfo ENOTFOUND your-backend-url-here` banner: `BACKEND_URL` on Vercel held the
template value, and the proxy tried to reach it.

## Vercel environment variables (project `antova-backend-demo`)

| Name | Required | Value |
|---|---|---|
| `LLM_API_KEY` | yes | The provider's API key. Server-only. |
| `LLM_MODEL_NAME` | yes | The model ID as the provider names it. |
| `LLM_BASE_URL` | no | OpenAI-compatible base URL that `/chat/completions` hangs off (default `https://api.openai.com/v1`). `https://api.anthropic.com` switches to Anthropic's Messages API. |
| `BACKEND_URL` | no | **Delete it** (or set it to a running FastAPI engine origin, no `/api`). |
| `BLOB_READ_WRITE_TOKEN` | strongly recommended | Added automatically when you connect a Vercel Blob store to the project (Storage → Blob → Connect). Without it, uploads and results live on one function instance's disk and can disappear between requests; health reports `storage: "ephemeral"`. Use a **private** store, or set `BLOB_ACCESS=public` for a public one. |
| `REVIEW_TOKEN` | recommended | When set, uploads, processing (which spends LLM credit) and decisions need this token, entered on the Settings page. Unset = anyone with the URL can run ingests on your key. |
| `LLM_TIMEOUT_MS` | no | Per model call, default 50000, capped at 52000 to fit the 60 s function limit. |

Redeploy after changing them.

## How a run works

`src/lib/native/pipeline.ts`. Upload parses each PDF with pdf.js (text and positions per page).
Processing is a job of steps, each saved before the next: one model call for the MR spec, one per bid,
then a deterministic assemble step. Any request can run the next step (POST starts it, each status
poll moves it on in the background), so no single function has to hold the whole run.

The model only finds text. Everything after is code, ported from the Python engine:

- every quote is looked up on its page; one that is not there is never trusted (flag `QUOTE_NOT_FOUND`,
  status `MANUAL_INSPECTION_REQUIRED`), and its box becomes the Inspector highlight
- values and units are parsed and converted in `values.ts` (kA/A, kV/V, °C/°F, ft/m, years/months,
  weeks/months/days, IP codes, IAC and Incoterm order, standards with editions, ranges)
- checks, statuses, conflicts, rate-table pricing (`rates/*.json`, copied from the Python engine),
  levelled totals, open items, review state and the evidence hash follow the Python code

Ask AI uses the same model when `ANTOVA_QA_URL` is not set.

## Limits

- Text PDFs only. Scanned pages have no text layer and are reported in `ingest_stats.no_text_pages`.
- Vercel caps request bodies at 4.5 MB, so larger PDFs need the FastAPI engine and `NEXT_PUBLIC_DIRECT_UPLOAD_URL`.
- Documents over ~110k characters are cut to the pages that mention the parameters (and prices); the
  cut is listed in the run's warnings.
- Excel exports (`export-tbe.xlsx`, `clarifications.xlsx`) answer 501; the clarification CSV works.
- No server-side evidence PNGs; the Inspector cuts crops from the PDF, as in replay mode.

## Testing without a key

```
node scripts/mock-llm.mjs                 # stand-in OpenAI-compatible model on :4010
npm run dev                               # with .env.local: LLM_BASE_URL=http://127.0.0.1:4010/v1, LLM_API_KEY=mock-key, LLM_MODEL_NAME=mock-model
node scripts/test-native-e2e.mjs http://localhost:3000
```

The stand-in answers by keyword search over the sample tender; it checks the plumbing, not model
quality. Run the same e2e script against a real model before relying on the results.
