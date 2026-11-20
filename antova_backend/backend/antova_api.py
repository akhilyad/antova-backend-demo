"""
Antova backend service.

- Tenders come from the ingest pipeline (antova_ingest) and are read from the
  database; nothing here is hardcoded tender data.
- Ingest jobs run on a background worker; the brief and review routes live in
  antova_briefs_api and antova_review_api.
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

import antova_engine as engine
from antova_auth import REVIEW_HEADER, require_review_token
from antova_briefs_api import router as briefs_router
from antova_db import init_db
from antova_ingest import config
from antova_ingest.pipeline import UnknownTender
from antova_models import IngestJobRequest, JobStatusResponse
from antova_ratelimit import RateLimitMiddleware, SlidingWindow
from antova_review_api import router as review_router
from antova_upload_api import router as upload_router
from antova_workers import job_manager

from fastapi import Depends


def configure_logging() -> None:
    """Log to stderr at ANTOVA_LOG_LEVEL (default INFO), unless the host already set logging up."""
    if logging.getLogger().handlers:
        return
    level = (os.environ.get("ANTOVA_LOG_LEVEL") or "INFO").upper()
    logging.basicConfig(level=level if level in logging.getLevelNamesMapping() else "INFO",
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    init_db()
    config.validate_config()  # an ontology or rate-table gap stops the service at startup
    job_manager.start()
    yield
    await job_manager.stop()


app = FastAPI(
    title="Antova: tender bid evaluation",
    description="Reads each bid against the spec, prices every gap from a rate table, cites every euro.",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Exact origins only. The Next.js proxy calls the engine server to server, so a deployment that
# routes the browser through it needs none; set ANTOVA_ALLOWED_ORIGINS only for direct browser calls.
# (A pattern such as *.vercel.app would admit every Vercel project, not just this one.)
configured_origins = [o.strip() for o in os.environ.get("ANTOVA_ALLOWED_ORIGINS", "").split(",") if o.strip()]
if not configured_origins:
    configured_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]

# Per-client limits on recalculation, page images and exports (antova_ratelimit.py).
rate_limiter = SlidingWindow()
app.add_middleware(RateLimitMiddleware, window=rate_limiter)

app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-antova-source", REVIEW_HEADER],
)

app.include_router(briefs_router)
app.include_router(review_router)
app.include_router(upload_router)


@app.get("/favicon.ico", include_in_schema=False)
def serve_favicon():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#06b6d4"/><text y="70" font-size="60" font-family="sans-serif" font-weight="900" fill="#020617" x="15">A</text></svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/api/health", tags=["System"])
def health_check():
    return {"status": "healthy", "version": app.version, "pint_version": engine.pint.__version__}


# --- INGEST JOBS ---

@app.post("/api/jobs/ingest", response_model=Dict[str, str], tags=["Jobs"], dependencies=[Depends(require_review_token)])
def start_ingest_job(req: IngestJobRequest):
    """Queues a real ingest of the tender folder (MR spec + vendor bids)."""
    try:
        job_id = job_manager.enqueue_ingest_job(tender_id=req.tender_id, mode=req.mode)
    except UnknownTender as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"job_id": job_id, "status": "QUEUED"}


@app.get("/api/jobs/{job_id}", response_model=JobStatusResponse, tags=["Jobs"], dependencies=[Depends(require_review_token)])
def get_job_status(job_id: str):
    status_resp = job_manager.get_job_status(job_id)
    if not status_resp:
        raise HTTPException(status_code=404, detail="Job not found")
    return status_resp
