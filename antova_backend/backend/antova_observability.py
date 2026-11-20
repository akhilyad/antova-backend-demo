"""Request IDs and access logs.

Every request carries an ID: the caller's X-Request-ID when it is a plain token (the Next.js proxy
sends one), else a new one. It is echoed in the response's X-Request-ID, attached to every log
record written while the request runs (as `request_id`), and logged once per request as a JSON
access line on the "antova.access" logger:

    {"event": "request", "request_id": "...", "method": "GET", "path": "/api/...", "status": 200, "ms": 12.3}

The UI shows the ID with an error, so a user's report can be matched to the server log.
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

REQUEST_ID_HEADER = "X-Request-ID"
_VALID_ID = re.compile(r"[A-Za-z0-9._-]{1,64}")

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
access_log = logging.getLogger("antova.access")


class RequestIdFilter(logging.Filter):
    """Adds `request_id` to every record, so formats can include %(request_id)s."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return True


def incoming_id(raw: str | None) -> str:
    raw = (raw or "").strip()
    return raw if _VALID_ID.fullmatch(raw) else uuid.uuid4().hex


class RequestIdMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
        request_id = incoming_id(headers.get(REQUEST_ID_HEADER.lower()))
        token = request_id_var.set(request_id)
        started = time.perf_counter()
        status = 500

        async def send_with_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", [])
                message["headers"] = [h for h in message["headers"] if h[0].lower() != b"x-request-id"]
                message["headers"].append((b"x-request-id", request_id.encode("latin-1")))
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            if scope.get("path") != "/api/health":  # health checks would drown the log
                access_log.info(json.dumps({
                    "event": "request",
                    "request_id": request_id,
                    "method": scope.get("method"),
                    "path": scope.get("path"),
                    "status": status,
                    "ms": round((time.perf_counter() - started) * 1000, 1),
                }))
            request_id_var.reset(token)
