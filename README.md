# Antova — Technical Bid Evaluation & Tender Auditing Engine

[![Next.js 15](https://img.shields.io/badge/Next.js-15.1.7-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.0.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-3.0.0-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Pint](https://img.shields.io/badge/Pint-0.26.2-orange?style=flat-square)](https://pint.readthedocs.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4.17-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-3178c6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Pytest](https://img.shields.io/badge/Pytest-175%20Passed-green?style=flat-square&logo=pytest)](https://pytest.org/)

> **Institutional-grade automated technical bid evaluation (TBE), scope omission add-back pricing, and tender auditing platform for high-voltage electrical equipment and EPC capital projects.**

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Core Architecture & Pipeline](#2-core-architecture--pipeline)
3. [Key Capabilities](#3-key-capabilities)
4. [Monorepo Directory Layout](#4-monorepo-directory-layout)
5. [Quickstart & Running Locally](#5-quickstart--running-locally)
6. [API Contract & Endpoint Reference](#6-api-contract--endpoint-reference)
7. [Governance, Security & Review Principles](#7-governance-security--review-principles)
8. [Testing & Verification](#8-testing--verification)

---

## 1. Executive Summary

In multi-million-euro EPC procurement (high-voltage GIS switchgear, step-up transformers, and BESS packages), the nominal lowest bidder frequently omits mandatory scope—such as factory acceptance test witnessing (I-FAT), copper busbar ratings, or DDP delivery terms. 

**Antova** provides deterministic, transparent bid auditing:
- **Parses & Indexes Proposal Corpus:** Reads complex engineering specifications and multi-vendor bids using PyMuPDF coordinate geometry.
- **Pint Unit Dimensional Engine:** Mathematically normalizes disparate engineering units (e.g. converting 104 °F $\rightarrow$ 40 °C, or 36,000 V $\rightarrow$ 36 kV) with zero hallucination.
- **Automated Scope Omission Add-Backs:** Prices every deviation against benchmark rate tables to establish the **True Evaluated Cost**.
- **Detects Commercial Rank Reversals:** Accurately unmasks nominal low bids that become subordinate once omitted technical and commercial scope is added back.
- **Institutional Governance:** Seals briefs, records reviewer signatures, and streams official multi-tab Excel (`.xlsx`) TBE workbooks and `.csv` clarification registers.

---

## 2. Core Architecture & Pipeline

```text
       ┌───────────────────────────┐      ┌───────────────────────────┐
       │ Material Requisition (MR) │      │ Multi-Vendor Proposal PDFs│
       │    Specification PDF      │      │ (Vendor A, B, C, D, ...)  │
       └─────────────┬─────────────┘      └─────────────┬─────────────┘
                     │                                  │
                     └────────────────┬─────────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │    Ingest & PyMuPDF Parser    │
                      │ Text extraction, BBox coords  │
                      └───────────────┬───────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │  Pint Dimensional Unit Engine │
                      │ Mathematical clause auditing  │
                      └───────────────┬───────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │ Rate Table Pricing Engine     │
                      │ Prices scope gaps & add-backs │
                      └───────────────┬───────────────┘
                                      ▼
                      ┌───────────────────────────────┐
                      │ True Job Cost Ledger          │
                      │ Reconciled ranking & adders   │
                      └───────┬───────────────┬───────┘
                              │               │
                              ▼               ▼
          ┌─────────────────────────┐   ┌─────────────────────────┐
          │ Next.js 15 UI Workbench │   │ Committee Deliverables  │
          │ Collapsible sidebar,    │   │ • Multi-sheet TBE .xlsx │
          │ Evidence viewer modal,  │   │ • Clarifications .csv   │
          │ Override drawer         │   │ • Printable sign-off    │
          └─────────────────────────┘   └─────────────────────────┘
```

---

## 3. Key Capabilities

### A. High-Density Audit Workbench & Collapsible Sidebar
- **21st.dev Collapsible Sidebar:** Smooth `w-64` to `w-16` responsive collapse with icon-only tooltips.
- **Navigation Sections:** Executive Dashboard, Bid Audits, Pint Compliance Matrix, Ingestion & Staging, Commodity Rate Sensitivity, TBE Exports, and Governance Settings.
- **Institutional Styling:** Precision dark theme (`#000000`, `#09090B`, `#111113`), `1px zinc-800` borders, `4px` corner radii, and strict `font-mono tabular-nums` numerical alignment.

### B. Deterministic True Job Cost Ledger
- Detects commercial rank reversals with real-time breakdowns.
- Example: In benchmark `TENDER-2026-402`, **VoltSwitch Industrial** submitted a nominal low quote of `€418,000`. Following systematic clause audits, VoltSwitch was assessed `+€49,000` in technical penalties and `+€15,800` in commercial adders, resulting in a **True Evaluated Cost of €482,800** and reversing rank in favor of **Nordwerk** (`€452,000`, 100% compliant).

### C. Documentary Evidence & Coordinate Bounding-Box Viewer
- PyMuPDF visual crop extraction for every technical requirement and vendor claim.
- Cites exact document filenames, page numbers, section headers, match confidence, and verbatim text quotes.

### D. Commodity Index & Labor Rate Sensitivity Recalculator
- Real-time sensitivity testing for conductor copper (0.5x – 2.5x), site labor (€20 – €200/hr), and heavy freight (0.5x – 2.5x).
- Instant ledger recalculation via FastAPI `/api/review/tenders/{id}/evaluate`.

### E. Manual Cost Override Drawer & Audit Justification
- Reviewers can override automated adders with whole-cent precision (`0.00`).
- Enforces mandatory audit notes committed to the database and official deliverables.

### F. Official Procurement Committee Sign-Off & Exports
- **Verify & Seal Workflow:** Locks the tender brief from draft status into verified status.
- **Official TBE Workbook (`.xlsx`):** Formatted multi-tab Excel model matching FIDIC / VDI procurement standards.
- **Clarification Registers (`.csv` / `.xlsx`):** Detailed clause registers ready to issue to bidders.
- **Printable Sign-Off Sheet (`/print/[tenderId]`):** Formal authorization sheet with signature blocks for the Chief Procurement Officer, Senior Electrical Lead Engineer, and Head of Estimating.

---

## 4. Monorepo Directory Layout

```text
antova_backend_UI/
├── README.md                          # Master architectural and operational manual
├── .gitignore                         # Comprehensive ignore rules
├── antova_backend/                    # Monorepo container
│   ├── start-backend.sh               # Shell script to start FastAPI on port 8000
│   ├── start-frontend.sh              # Shell script to start Next.js on port 3000
│   ├── run-tests.sh                   # Pytest test execution script
│   ├── .env.example                   # Environment variable template
│   ├── backend/                       # Python FastAPI Backend Engine
│   │   ├── antova_api.py              # Root API application & middleware
│   │   ├── antova_auth.py             # Review token security & principal models
│   │   ├── antova_briefs_api.py       # Public brief reading & evaluation routes
│   │   ├── antova_db.py               # SQLite schema, transactions & ORM
│   │   ├── antova_engine.py           # Pint dimensional analysis & rate evaluation
│   │   ├── antova_evidence.py         # PyMuPDF coordinate & PDF crop renderer
│   │   ├── antova_export.py           # Multi-sheet Excel TBE & CSV generator
│   │   ├── antova_models.py           # Pydantic data schemas
│   │   ├── antova_review_api.py       # Reviewer overrides, verification & clearance
│   │   ├── antova_upload_api.py       # File streaming & manifest ingestion
│   │   ├── antova_workers.py          # Background ingest worker & progress tracker
│   │   ├── antova_enterprise.db       # Seed database with benchmark packages
│   │   ├── antova_requirements.txt    # Python package dependencies
│   │   ├── pytest.ini                 # Pytest configuration
│   │   ├── test_*.py                  # 175-test pytest verification suite
│   │   ├── antova_ingest/             # PDF extraction, locator & rate sweep
│   │   └── samples/                   # Pre-staged benchmark tenders (402, 417, 418)
│   ├── frontend/                      # Next.js 15 Production Workbench
│   │   ├── package.json               # Next.js 15, React 19, Tailwind CSS, Lucide
│   │   ├── tsconfig.json              # TypeScript strict configuration
│   │   ├── next.config.ts             # App Router & API proxy rewrites
│   │   ├── tailwind.config.ts         # High-density zinc color palette
│   │   ├── components.json            # Shadcn configuration (@/components/ui)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── page.tsx           # Executive Operations Dashboard (Sidebar)
│   │   │   │   ├── layout.tsx         # Root layout with dark mode class
│   │   │   │   ├── globals.css        # Tailwind styling & tabular-nums
│   │   │   │   ├── audit/[tenderId]/  # Split-pane interactive audit workbench
│   │   │   │   ├── ingest/            # Multi-file staging dropzone & presets
│   │   │   │   ├── print/[tenderId]/  # Printable formal sign-off report
│   │   │   │   └── demo/              # Standalone collapsible sidebar demo
│   │   │   ├── components/
│   │   │   │   ├── Header.tsx         # Top bar with tender switcher & actions
│   │   │   │   ├── TrueJobCostTable.tsx # Ranked bidder comparison ledger
│   │   │   │   ├── LineItemDrilldown.tsx# Parameter drilldown & formulas
│   │   │   │   ├── ComplianceMatrix.tsx # Pint unit evaluated clause matrix
│   │   │   │   ├── CommercialRiskTable.tsx # Commercial terms & delivery analysis
│   │   │   │   ├── SensitivityPanel.tsx # Commodity & labor recalculation sliders
│   │   │   │   ├── OverrideDrawer.tsx # Whole-cent manual adder editor
│   │   │   │   ├── EvidenceModal.tsx  # PyMuPDF coordinate crop viewer
│   │   │   │   ├── SplitUploadDropzone.tsx # Document staging dropzone
│   │   │   │   └── ui/
│   │   │   │       ├── dashboard-with-collapsible-sidebar.tsx # 21st.dev sidebar
│   │   │   │       └── demo.tsx       # Demo component export
│   │   │   └── lib/
│   │   │       ├── api.ts             # Typed REST client with token auth
│   │   │       ├── types.ts           # Complete TypeScript type definitions
│   │   │       └── formatting.ts      # Currency, numbers & ISO formatting
│   └── docs/                          # Architectural blueprints & specs
```

---

## 5. Quickstart & Running Locally

### Prerequisites
- **Node.js** $\ge$ 18.0.0
- **Python** $\ge$ 3.11 with `pip` / virtual environment

### 1. Launch the Backend Engine
```bash
cd antova_backend/backend
# In your Python virtual environment:
pip install -r antova_requirements.txt
uvicorn antova_api:app --host 127.0.0.1 --port 8000
```
*Health Check:* `curl http://127.0.0.1:8000/api/health` $\rightarrow$ `{"status":"healthy","version":"3.0.0","pint_version":"0.26.2"}`.

### 2. Launch the Next.js Frontend
```bash
cd antova_backend/frontend
npm install
npm run build
npm start
# Or for live hot-reload development:
npm run dev
```
Open **`http://localhost:3000`** in your browser.

### 3. Deploying to Vercel (Multi-Service & Environment Setup)

#### Option A: Vercel Multi-Service Monorepo Preset (Recommended)
1. Import the repository into Vercel with **Root Directory** set to either `.` or `antova_backend`.
2. Vercel automatically detects the multi-service layout via `vercel.json`:
   - `frontend` (Next.js 15) receives all main application traffic (`/(.*)`).
   - `web` (Vite) handles internal assets and legacy review routes (`/b/(.*)`, `/review/(.*)`).
3. Set the following Environment Variables in the Vercel Project Settings:
   - `BACKEND_URL`: the hosted FastAPI engine (see "Hosting the FastAPI engine" below), e.g. `https://api.example.com`. Unset means **replay mode**: the site serves the saved `TENDER-2026-402` sample read-only.
   - `REVIEW_TOKEN` (optional, server-only): a token the proxy adds to **read** requests only, so visitors can browse a live backend. Writes always need the reviewer's own token, entered on the Settings page.
   - Leave `NEXT_PUBLIC_API_URL` unset so the browser talks to the same-origin proxy. There is no `NEXT_PUBLIC_REVIEW_TOKEN`: anything `NEXT_PUBLIC_*` ships in the browser bundle.

#### Hosting the FastAPI engine
Vercel functions cannot run the engine: it keeps an in-process job queue, writes SQLite and tender PDFs to disk, and an ingest calls the LLM for minutes. Run `antova_backend/backend/Dockerfile` on a host with a persistent volume and **one** instance (Fly.io, Render, Railway, or Cloud Run with min and max instances set to 1):

```bash
cd antova_backend/backend
docker build -t antova-engine .
docker run -p 8000:8000 -v antova-data:/data \
  -e ANTOVA_REVIEW_TOKEN="$(openssl rand -hex 32)" \
  -e ANTOVA_ALLOWED_ORIGINS="https://your-site.vercel.app" \
  -e ANTOVA_CLIENT_IP_HEADER=x-forwarded-for \
  -e EXPLABS_API_KEY=... antova-engine
```

Engine settings worth knowing for a public deployment:

- `ANTOVA_ALLOWED_ORIGINS`: exact browser origins allowed to call the engine directly. Calls through the Next.js proxy are same-origin and need none. There is no wildcard for `*.vercel.app`.
- Rate limits per client and minute: `ANTOVA_RATE_LIMIT_EVALUATE` (30), `ANTOVA_RATE_LIMIT_EVIDENCE` (240), `ANTOVA_RATE_LIMIT_EXPORT` (20); `ANTOVA_RATE_LIMIT=off` disables them. Behind the proxy, set `ANTOVA_CLIENT_IP_HEADER=x-forwarded-for` so clients are told apart (only when the engine is reachable through that proxy alone, since a client can forge the header).
- A failed ingest job reports document problems (bad manifest, unreadable PDF, model refusal) in full. Provider and internal errors report only a job reference; the details are in the server log.

The image stores the database at `/data/antova.db` and uploads under `/data/tenders` (seeded from `samples/` on first start). Point `ANTOVA_DATABASE_URL` at Postgres instead of SQLite when you outgrow one instance's disk.

#### Option B: Standalone Next.js Project on Vercel
1. Set Vercel Root Directory directly to `antova_backend/frontend`.
2. Configure `NEXT_PUBLIC_API_URL` to point to your hosted backend.
3. Next.js automatically proxies all `/api/...` calls via serverless runtime handlers (`src/app/api/[[...path]]/route.ts`), completely bypassing browser cross-origin CORS limitations.

#### Built-in High-Availability & Demo-Day Safeguards
- **Smart CORS Failover:** The API client attempts direct calls to `NEXT_PUBLIC_API_URL`; if blocked by browser CORS preflight or network restrictions, it automatically retries via the serverless internal proxy.
- **Replay mode:** If no backend is configured or it cannot be reached, the proxy serves the saved snapshot of `TENDER-2026-402`, read-only and marked `x-antova-source: replay`. Any other tender ID is a 404, and every write (upload, manifest, ingest, decision) is refused with 405. When the backend does answer, its response (including 404 and 5xx) is passed through unchanged.
- **React ErrorBoundary:** All workbench tabs are encapsulated in localized Error Boundaries with 1-click retry cards, ensuring isolated component issues never unmount the application shell.

---

## 6. API Contract & Endpoint Reference

All endpoints requiring reviewer access expect an `X-Antova-Review-Token` header carrying a token configured on the server (`ANTOVA_REVIEW_TOKEN` or `ANTOVA_REVIEWERS`). There is no default token.

| Method | Endpoint Path | Description | Expected Payload / Response |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health & Pint version | `{"status": "healthy", "version": "3.0.0", "pint_version": "0.26.2"}` |
| `GET` | `/api/review/tenders` | List ingested tender registry | Returns `ReviewTenderRow[]` (tender ID, title, status, open items) |
| `GET` | `/api/review/tenders/{id}` | Complete brief & true job costs | Returns `Brief` (vendors, parameters, financials, open items) |
| `POST`| `/api/review/tenders/{id}/evaluate` | Recalculate rates dynamically | Body: `{"copper_multiplier": 1.2, "site_labor_rate": 60, "freight_multiplier": 1.0}` |
| `GET` | `/api/review/tenders/{id}/evidence/{p}/{v}/{which}.png` | PyMuPDF crop PNG | Returns `image/png` (coordinate cropped citation) |
| `PUT` | `/api/review/tenders/{id}/overrides/{p}/{v}` | Apply manual cost adder | Body: `{"adder_eur": "9300.00", "note": "Audited logistics quote"}` (204 No Content) |
| `DELETE`| `/api/review/tenders/{id}/overrides/{p}/{v}` | Revert manual override | Reverts to automated rate table pricing (204 No Content) |
| `POST`| `/api/review/tenders/{id}/verify` | Seal brief for award | Transitions tender from `DRAFT` to `VERIFIED` |
| `POST`| `/api/review/tenders/{id}/withdraw` | Unlock brief to draft | Transitions tender from `VERIFIED` to `DRAFT` |
| `GET` | `/api/review/tenders/{id}/export-tbe.xlsx` | Export official TBE model | Returns `.xlsx` workbook (HTTP 409 Conflict if still in DRAFT) |
| `GET` | `/api/review/tenders/{id}/clarifications.csv` | Export clarification log | Returns `.csv` with exact quoted passages and clauses |
| `GET` | `/api/review/tenders/{id}/clarifications.xlsx`| Export clarification sheet | Returns formatted `.xlsx` workbook |
| `POST`| `/api/jobs/ingest` | Queue background ingest | Body: `{"tender_id": "TENDER-2026-402", "mode": "replay"}` |
| `GET` | `/api/jobs/{job_id}` | Poll ingestion progress | Returns `Job` status, progress %, current stage, and results |

---

## 7. Governance, Security & Review Principles

- **Deterministic Evaluation:** Rule outcomes are computed mathematically using Pint; they are never randomized or hallucinated.
- **Full Traceability:** Every cost adder is tied directly to a PyMuPDF citation, page number, and SHA-256 evidence hash.
- **Mandatory Justification:** Overriding an automated cost adder requires an audit justification note recorded in `antova_enterprise.db`.
- **Award Verification Gate:** The official Technical Bid Evaluation workbook (`.xlsx`) cannot be downloaded until all mandatory verification items are cleared and the brief is verified and sealed.

---

## 8. Testing & Verification

Execute the backend test suite:
```bash
cd antova_backend/backend
pytest
```
*Result:* **175 passed** tests covering Pint rules, rate table precedence, export generation, PyMuPDF cropping, and verification gates.

Execute frontend type-checking:
```bash
cd antova_backend/frontend
npm run typecheck
```
*Result:* **0 errors**, strict TypeScript validation passing across all pages, components, and API client types.

---

## License
Proprietary & Confidential. Copyright © 2026 Antova Inc. All rights reserved.
