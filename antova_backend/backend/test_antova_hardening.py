"""P1 hardening: what job errors tell a client, CORS origins, and rate limits."""

from fastapi.testclient import TestClient

from antova_ingest.chat_locator import LocateApiError
from antova_ratelimit import SlidingWindow
from antova_workers import job_error_message

from test_antova import REVIEW_HEADERS, TENDER_ID, _wait_for_job, client, ingested  # noqa: F401 (fixtures)


# --- job errors -------------------------------------------------------------------------------

def test_document_failures_keep_their_message():
    from antova_ingest.pipeline import IngestFailed

    assert job_error_message(IngestFailed("manifest names TENDER-2026-402"), "job-1") == \
        "IngestFailed: manifest names TENDER-2026-402"


def test_provider_errors_do_not_leak_the_provider_response():
    err = LocateApiError("bid.pdf", "https://api.example.ai/v1 answered 500 for bid.pdf: {\"internal\": \"trace...\"}")
    message = job_error_message(err, "job-abc")
    assert "api.example.ai" not in message and "trace" not in message
    assert "job-abc" in message


def test_unexpected_errors_do_not_leak_internals():
    message = job_error_message(RuntimeError("KeyError at /srv/app/antova_db.py line 412"), "job-abc")
    assert "antova_db" not in message and "KeyError" not in message
    assert "job-abc" in message


def test_crashed_job_reports_a_reference_not_the_exception(ingested, monkeypatch):
    from antova_workers import job_manager

    class _Crashing:
        def locate(self, doc):
            raise RuntimeError("secret internal detail")

    monkeypatch.setattr(job_manager, "locator_factory", lambda d, m: _Crashing())
    from antova_api import app

    with TestClient(app, headers=REVIEW_HEADERS) as client:
        job_id = client.post("/api/jobs/ingest", json={"tender_id": TENDER_ID, "mode": "replay"}).json()["job_id"]
        status = _wait_for_job(client, job_id)
    assert status["status"] == "FAILED"
    assert "secret internal detail" not in status["error"]
    assert job_id in status["error"]


# --- CORS -------------------------------------------------------------------------------------

def test_cors_no_longer_trusts_every_vercel_app(client):
    response = client.options("/api/review/tenders", headers={
        "Origin": "https://someone-elses-project.vercel.app",
        "Access-Control-Request-Method": "GET",
    })
    assert "access-control-allow-origin" not in response.headers


# --- rate limits ------------------------------------------------------------------------------

class _Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_sliding_window_blocks_over_the_limit_and_recovers():
    clock = _Clock()
    window = SlidingWindow(clock=clock)
    key = ("1.2.3.4", "evaluate")
    assert all(window.hit(key, 3) is None for _ in range(3))
    retry = window.hit(key, 3)
    assert retry is not None and 1 <= retry <= 60
    clock.now += 61
    assert window.hit(key, 3) is None


def test_clients_have_separate_windows():
    window = SlidingWindow(clock=_Clock())
    assert window.hit(("a", "evaluate"), 1) is None
    assert window.hit(("b", "evaluate"), 1) is None
    assert window.hit(("a", "evaluate"), 1) is not None


def test_evaluate_answers_429_over_the_limit(client, monkeypatch):
    from antova_api import rate_limiter

    monkeypatch.setenv("ANTOVA_RATE_LIMIT", "on")
    monkeypatch.setenv("ANTOVA_RATE_LIMIT_EVALUATE", "2")
    rate_limiter.reset()
    try:
        path = f"/api/review/tenders/{TENDER_ID}/evaluate"
        body = {"copper_multiplier": 1.0, "freight_multiplier": 1.0}
        codes = [client.post(path, json=body, headers=REVIEW_HEADERS).status_code for _ in range(3)]
        assert codes[2] == 429, codes
        limited = client.post(path, json=body, headers=REVIEW_HEADERS)
        assert limited.status_code == 429
        assert int(limited.headers["retry-after"]) >= 1
        assert limited.json()["code"] == "rate_limited"
        # Other routes are not limited.
        assert client.get("/api/health").status_code == 200
    finally:
        rate_limiter.reset()
