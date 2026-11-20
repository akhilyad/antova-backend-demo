"""Per-client rate limits for the routes that cost CPU: recalculation, page images and exports.

In memory, one process: the engine runs as a single worker (see antova_workers.py), so one
counter is the whole picture. A sliding window per (client, bucket); a request over the limit gets
429 with Retry-After and is not counted again.

Configuration (environment):
    ANTOVA_RATE_LIMIT                 "off" disables the limits (tests and local work)
    ANTOVA_RATE_LIMIT_EVALUATE        requests per minute per client for .../evaluate (default 30)
    ANTOVA_RATE_LIMIT_EVIDENCE        per minute for page images (default 240)
    ANTOVA_RATE_LIMIT_EXPORT          per minute for .xlsx/.csv exports (default 20)
    ANTOVA_CLIENT_IP_HEADER           a header set by a proxy you trust to name the client, e.g.
                                      x-forwarded-for (first entry is used). Unset: the socket peer.

Behind the Next.js proxy every request shares the proxy's address unless ANTOVA_CLIENT_IP_HEADER
names the forwarded header, so set it there (and only there: a client can forge it otherwise).
"""

from __future__ import annotations

import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

WINDOW_SECONDS = 60.0


@dataclass(frozen=True)
class Bucket:
    name: str
    pattern: re.Pattern[str]
    env: str
    default: int


BUCKETS = (
    Bucket("evaluate", re.compile(r"^/api/(briefs|review/tenders)/[^/]+/evaluate$"), "ANTOVA_RATE_LIMIT_EVALUATE", 30),
    Bucket("evidence", re.compile(r"^/api/(briefs|review/tenders)/[^/]+/evidence/.+\.png$"), "ANTOVA_RATE_LIMIT_EVIDENCE", 240),
    Bucket("export", re.compile(r"^/api/review/tenders/[^/]+/[^/]+\.(xlsx|csv)$"), "ANTOVA_RATE_LIMIT_EXPORT", 20),
)


def _limit(bucket: Bucket) -> int:
    try:
        return max(1, int(os.environ.get(bucket.env) or bucket.default))
    except ValueError:
        return bucket.default


def _enabled() -> bool:
    return (os.environ.get("ANTOVA_RATE_LIMIT") or "on").strip().lower() not in ("off", "0", "false", "no")


def client_key(request: Request) -> str:
    header = (os.environ.get("ANTOVA_CLIENT_IP_HEADER") or "").strip().lower()
    if header:
        value = request.headers.get(header, "")
        first = value.split(",")[0].strip()
        if first:
            return first
    return request.client.host if request.client else "unknown"


class SlidingWindow:
    def __init__(self, clock=time.monotonic):
        self._hits: dict[tuple[str, str], deque[float]] = {}
        self._lock = threading.Lock()
        self._clock = clock

    def hit(self, key: tuple[str, str], limit: int) -> float | None:
        """Count one request. None when allowed, else the seconds until the next one would be."""
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and now - hits[0] >= WINDOW_SECONDS:
                hits.popleft()
            if len(hits) >= limit:
                return max(1.0, WINDOW_SECONDS - (now - hits[0]))
            hits.append(now)
            if len(self._hits) > 50_000:  # forget idle clients rather than grow without bound
                for k in [k for k, v in self._hits.items() if not v]:
                    del self._hits[k]
            return None

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp, window: SlidingWindow | None = None):
        self.app = app
        self.window = window or SlidingWindow()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope.get("method") == "OPTIONS" or not _enabled():
            await self.app(scope, receive, send)
            return
        path = scope.get("path", "")
        bucket = next((b for b in BUCKETS if b.pattern.match(path)), None)
        if bucket is None:
            await self.app(scope, receive, send)
            return
        retry_after = self.window.hit((client_key(Request(scope)), bucket.name), _limit(bucket))
        if retry_after is None:
            await self.app(scope, receive, send)
            return
        response = JSONResponse(
            {"detail": "Too many requests. Wait a moment and try again.", "code": "rate_limited"},
            status_code=429,
            headers={"Retry-After": str(int(retry_after + 0.999))},
        )
        await response(scope, receive, send)
