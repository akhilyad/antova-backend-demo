# Repositories and environments

Where each part of Antova lives, where it runs, and which settings it needs. Settings are listed by
name only; values belong in the host's secret store, never in the repo.

## Canonical repositories

| Repo | Role | Ships |
|---|---|---|
| `akhilyad/antova-backend-demo` (this repo) | Source of truth for the engine and the workbench | Workbench on Cloudflare Workers |
| `akhilyad/antova-yc` | Landing page and the YC reference copy of the engine and brief site | Landing page on Vercel |

Engine changes land here first. `antova-yc/antova_backend` is a reference copy, not a second place
to fix things.

## What runs where

| Surface | Code | Host | URL |
|---|---|---|---|
| Landing page | `antova-yc` root (`src/`, Vite) | Vercel | https://antova.vercel.app |
| Workbench + built-in engine | `antova_backend/frontend` (Next.js, OpenNext) | Cloudflare Workers, R2 bucket `antova-workbench-data` | https://antova-workbench.akhilfut.workers.dev |
| FastAPI engine (optional) | `antova_backend/backend` | None today; local only | `http://localhost:8000` |
| Brief site (Vite) | `antova_backend/backend/web` | Vercel, same project as the old workbench deploy | — |

## Settings by environment

| Setting | Secret? | Local `next dev` (`.env.local`) | Local Workers (`.dev.vars`) | Cloudflare | Notes |
|---|---|---|---|---|---|
| `LLM_API_KEY` | yes | set | set | `wrangler secret put` | Model key for the built-in engine |
| `LLM_MODEL_NAME` | yes | set | set | `wrangler secret put` | |
| `LLM_BASE_URL` | no | set | from `wrangler.jsonc` vars | `wrangler.jsonc` vars | OpenAI-compatible endpoint |
| `LLM_TIMEOUT_MS` | no | optional | optional | optional | Per-call model timeout |
| `REVIEW_TOKEN` | yes | optional | optional | `wrangler secret put` | Gate on `/api` writes; leave set in production |
| `ANTOVA_BUCKET` | binding | — | local R2 under `.wrangler/` | `wrangler.jsonc` `r2_buckets` | Storage for uploads, jobs, tenders |
| `ANTOVA_DATA_DIR` | no | optional | — | — | Disk store when there is no R2 or Blob |
| `BACKEND_URL` | no | optional | unset | unset | Only when a FastAPI engine should serve `/api` |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_DIRECT_UPLOAD_URL`, `NEXT_PUBLIC_LANDING_URL` | no, baked into the bundle | optional | optional | build-time | Public by design |
| `BLOB_READ_WRITE_TOKEN`, `BLOB_ACCESS` | yes / no | — | — | — | Vercel-only storage path; unused on Cloudflare |

FastAPI engine (`antova_backend/backend`, local only): `ANTHROPIC_API_KEY` or `EXPLABS_API_KEY`
with `EXPLABS_BASE_URL` / `EXPLABS_MODEL`, plus `ANTOVA_REVIEW_TOKEN`, `ANTOVA_DATABASE_URL`,
`ANTOVA_ALLOWED_ORIGINS` and `ANTOVA_RATE_LIMIT`. Tests blank every key (`conftest.py`).

Landing page: `VITE_INTAKE_ENDPOINT` only, which is public by design (see `antova-yc/.env.example`).

Templates: `antova_backend/frontend/.dev.vars.example`. Deploy steps: `cloudflare-workers.md`.
