#!/bin/sh
set -eu

# Refuse to start without review credentials: the review routes would answer 503 anyway,
# and a misconfigured deploy should fail loudly at boot rather than at first use.
if [ -z "${ANTOVA_REVIEW_TOKEN:-}" ] && [ -z "${ANTOVA_REVIEWERS:-}" ]; then
  echo "ANTOVA_REVIEW_TOKEN or ANTOVA_REVIEWERS must be set" >&2
  exit 1
fi

# First start on an empty volume: copy the sample tenders so the demo tenders can be ingested.
if [ ! -d "$ANTOVA_TENDERS_DIR" ] || [ -z "$(ls -A "$ANTOVA_TENDERS_DIR" 2>/dev/null)" ]; then
  mkdir -p "$ANTOVA_TENDERS_DIR"
  for d in /app/samples/TENDER-*; do
    [ -d "$d" ] && cp -r "$d" "$ANTOVA_TENDERS_DIR/"
  done
fi

# One worker: jobs queued on one worker are invisible to another (see antova_workers.py).
exec uvicorn antova_api:app --host 0.0.0.0 --port "${PORT:-8000}" --workers 1 --proxy-headers
