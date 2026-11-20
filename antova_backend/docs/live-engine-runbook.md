# Live engine runbook: connecting the workbench to a real engine

Written 2026-11-20 with branch `feat/live-engine-inspector`. It covers `/ingest`, the Evidence
Inspector (full PDF pages), the Sensitivity Workbench and Ask AI.

## 1. Why the live site says "no live engine"

| Symptom | Root cause | Fix in this branch |
|---|---|---|
| `/ingest` locked with *"This public demo has no live engine attached…"* | The Vercel project has no `BACKEND_URL`, so `/api/[[...path]]` serves the saved sample (replay) and `/api/health` answers `mode: "replay"`. The form also locked when the health fetch **threw**, which a CORS block (with `NEXT_PUBLIC_API_URL` set) or a 503 also does, so a connected engine could still read as "no engine". | The health probe always goes through the same-origin proxy (`probeEngine()` in `lib/api.ts`). Only real replay locks the form. Replay now says *why*: `reason: not_configured` or `reason: unreachable` (with host and error). Degraded or unknown answers are reported without locking the form. |
| Evidence viewer blank: "Page image not available" | Replay answered 404 for every `/evidence/*.png` (no crops were saved with the sample), and **no endpoint served the full source PDF**, in this repo or in antova-yc. The old modal could only show a crop. | New engine route `GET /api/review/tenders/{id}/documents/{filename}` (token-gated, only files the brief lists, path-checked by `antova_evidence.document_path`). In replay, the proxy redirects that route to `/samples/TENDER-2026-402/*.pdf`, which ships in `frontend/public`. The Inspector renders pages with pdf.js. Crops use the engine PNG when it exists and are cut in the browser otherwise. |
| Large uploads fail on Vercel | Vercel functions cap request bodies at 4.5 MB; the spec allows 50 MB PDFs through the proxy. | Optional `NEXT_PUBLIC_DIRECT_UPLOAD_URL` sends file PUTs straight to the engine. A 413 now says exactly this. |

Engine endpoints are otherwise identical between this repo and `antova-yc` (same routes in
`antova_review_api.py`, `antova_upload_api.py`, `antova_briefs_api.py`). Only `antova_api.py` differs:
this repo adds request IDs, rate limits and the DB health check. The new `documents/` route exists
only here; port it to antova-yc when that repo needs the Inspector.

## 2. Environment variables

### Vercel project `antova-backend-demo` (service root `antova_backend/frontend`)

| Name | Example | Where it comes from | Required |
|---|---|---|---|
| `BACKEND_URL` | `https://antova-engine.fly.dev` | The engine host's public origin. **No `/api` suffix, no trailing slash.** | Yes, for live mode. Unset = replay. |
| `REVIEW_TOKEN` | `rt_…` (32+ random chars) | The same value as the engine's `ANTOVA_REVIEW_TOKEN` (or one reviewer's token from `ANTOVA_REVIEWERS`). Server-only; added to **GET/HEAD only**, so visitors can browse but not write. | Yes, if anonymous visitors should see live tenders and PDFs. |
| `NEXT_PUBLIC_DIRECT_UPLOAD_URL` | `https://antova-engine.fly.dev` | Same origin as `BACKEND_URL`. Lets PDFs over 4.5 MB upload straight to the engine. Needs the engine CORS entry below. | Optional. |
| `ANTOVA_QA_URL` | `https://qa.example.com/v1/ask` | Your Q&A service (contract in §5). Unset = Ask AI disabled, with a tooltip naming this variable. | Optional. |
| `ANTOVA_QA_TOKEN` | `sk-…` | The Q&A service's API key, sent as `Authorization: Bearer`. | With `ANTOVA_QA_URL`. |
| `ANTOVA_QA_PUBLIC` | `1` | Allows Ask AI without a reviewer token **only when no engine is configured**. Leave unset in production. | No. |
| `NEXT_PUBLIC_LANDING_URL` | `https://antovayc.vercel.app` | Landing page origin for "Send us your tender" links. | Default is fine. |
| `NEXT_PUBLIC_API_URL` | (leave unset) | Legacy: sends **every** browser call direct to the engine, which needs CORS and loses the server read token. Use `BACKEND_URL` + `NEXT_PUBLIC_DIRECT_UPLOAD_URL` instead. | No. |

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them.

### Engine host (Docker image from `antova_backend/backend/Dockerfile`)

| Name | Example | Notes |
|---|---|---|
| `ANTOVA_REVIEW_TOKEN` *or* `ANTOVA_REVIEWERS` | `rt_…` / `{"akhil":{"name":"Akhil Yadav","token":"rt_…"}}` | The entrypoint refuses to start without one. Generate with `python -c "import secrets;print(secrets.token_urlsafe(32))"`. |
| `ANTOVA_DATABASE_URL` | `sqlite:////data/antova.db` or `postgresql+psycopg://…` | Default `sqlite:///./antova_enterprise.db` is lost on redeploy. Put SQLite on a persistent volume. |
| `ANTOVA_TENDERS_DIR` | `/data/tenders` | Where uploaded PDFs live. **Must be a persistent volume**: the Inspector reads PDFs from here. Seeded with the sample tenders on first boot. |
| `ANTOVA_ALLOWED_ORIGINS` | `https://antova-backend-demo-antovabackend.vercel.app` | Exact origins, comma-separated. Needed **only** for direct browser calls (`NEXT_PUBLIC_DIRECT_UPLOAD_URL`). The proxy is server-to-server and needs none. Don't use wildcards. |
| `EXPLABS_API_KEY` (+ `EXPLABS_BASE_URL`, `EXPLABS_MODEL`) | from Experiential Labs | Locate model for new tenders (`mode: auto`). Chosen automatically when set. |
| `ANTHROPIC_API_KEY` | from console.anthropic.com | Alternative locate provider. Set `ANTOVA_LOCATE_PROVIDER=anthropic` to choose it explicitly. |
| `ANTOVA_LOCATE_PROVIDER` | `explabs` / `anthropic` | Optional override. |
| `ANTOVA_CLIENT_IP_HEADER` | `x-forwarded-for` | For per-client rate limits behind a proxy. |
| `PORT` | `8000` | Host-assigned. Run **one** worker: the entrypoint does, because jobs are in-process. |

Storage and webhooks: there are none to configure. Uploads are streamed to `ANTOVA_TENDERS_DIR`, and
job progress is polled (`GET /api/jobs/{id}`), not pushed.

## 3. Routes each feature uses (all same-origin through `/api`)

| Feature | Route(s) | Notes |
|---|---|---|
| Health / mode | `GET /api/health` | Replay: `200 {mode:"replay", reason}`. Live: `200 {status:"healthy", mode:"live"}`. DB down: `503`. |
| `/ingest` | `PUT /api/review/tenders/{id}/files/{name}.pdf` → `PUT …/manifest` → `POST /api/jobs/ingest {mode:"auto"}` → poll `GET /api/jobs/{job}` | Writes need the **reviewer's own** token (Settings page); the server token is never added to writes. |
| Evidence Inspector | `GET /api/review/tenders/{id}/documents/{file}` (PDF), `GET …/evidence/{param}/{source}/{which}.png` (crop), `GET …/reviews` (notes) | Proxy timeout for PDFs: 30 s. |
| Sensitivity Workbench | Runs in the browser from the brief. "Apply these rates in the engine" → `POST /api/review/tenders/{id}/evaluate` | Replay answers 405 `replay_no_recalc`. |
| Ask AI | `GET /api/ask` (enabled?), `POST /api/ask` | Next route, not proxied. Checks the reviewer token against the engine before forwarding. |

## 4. Local development

```bash
# Engine (terminal 1), from antova_backend/backend
pip install -r antova_requirements.txt
ANTOVA_REVIEW_TOKEN=dev-review-token-antova ANTOVA_TENDERS_DIR="$PWD/samples" \
  python -m uvicorn antova_api:app --host 127.0.0.1 --port 8000
# Load the sample tender into the DB:
curl -X POST -H "X-Antova-Review-Token: dev-review-token-antova" -H "Content-Type: application/json" \
  -d '{"tender_id":"TENDER-2026-402","mode":"replay"}' http://127.0.0.1:8000/api/jobs/ingest

# Workbench (terminal 2), from antova_backend/frontend. In dev, BACKEND_URL defaults to 127.0.0.1:8000.
npm ci
REVIEW_TOKEN=dev-review-token-antova npm run dev     # http://localhost:3000

# Checks
npm run typecheck && npm run test:unit && npm run test:snapshot && npm run build
(cd ../backend && python -m pytest -q)
```

Without the engine running, `npm run dev` shows the replay sample, and `/ingest` explains that the
engine at `http://127.0.0.1:8000` isn't answering.

## 5. Ask AI service contract

```
POST $ANTOVA_QA_URL
Authorization: Bearer $ANTOVA_QA_TOKEN          (when set)
{ "question": "...", "context": { "tender_id", "param_id", "vendor_id", "filename", "page", "quote", "requirement" } }
→ 200 { "answer": "..." }
```

Errors map to: 501 not configured, 401 no or invalid reviewer token, 422 bad input, 502 service
error, 504 timeout (45 s).

## 6. Production smoke test (after deploying both)

Let `S=https://antova-backend-demo-antovabackend.vercel.app` and `T=<a reviewer token>`.

1. **Health is live**
   `curl -s $S/api/health` → `200` with `"mode":"live"` and `"status":"healthy"`.
   `"mode":"replay","reason":"not_configured"` means `BACKEND_URL` is missing or the deploy predates it. `"reason":"unreachable"` means the engine is down or the URL is wrong (the `error` field says which). `503` means the engine is up but its database isn't.
   UI: `/ingest` says *"Connected to the live engine (v3.0.0)"* and the form is enabled.
2. **Source PDF streams**
   `curl -s -o /dev/null -w '%{http_code} %{content_type}\n' $S/api/review/tenders/TENDER-2026-402/documents/MR-33kV-GIS-Rev4.pdf` → `200 application/pdf` (needs `REVIEW_TOKEN` on Vercel; without it `401`).
   `…/documents/manifest.json` → `404`.
   UI: open the audit → Requirements → any `p. N` link. The Inspector shows the full page with the clause boxed in red, and the rail caption reads *"Cut by the engine from the stored PDF."*
3. **Upload and ingest**
   `curl -s -X PUT -H "X-Antova-Review-Token: $T" -H "Content-Type: application/pdf" --data-binary @spec.pdf $S/api/review/tenders/TENDER-TEST-001/files/spec.pdf` → `201` with `pages`. The same call without a token → `401`. A file over 4.5 MB through the proxy → `413` (set `NEXT_PUBLIC_DIRECT_UPLOAD_URL`).
   UI: Settings → paste the token → `/ingest` → upload → the stepper moves Upload → Queued → Parsing → Extracting → Pricing → Complete, then opens `/audit/TENDER-TEST-001`.
4. **Sensitivity and Ask AI**
   UI: audit → Rate scenarios. The chart draws 5,000 runs, the handles drag, and the cards update. "Apply these rates in the engine" → *"Totals updated with the new rates."* (`POST …/evaluate` → `200`).
   `curl -s $S/api/ask` → `{"enabled":true}` once `ANTOVA_QA_URL` is set (else `false`, and the Inspector's Ask AI button is disabled with a tooltip naming the variable).
