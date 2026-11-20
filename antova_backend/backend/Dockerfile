# Antova engine (FastAPI). Run ONE instance with a persistent volume at /data:
# the ingest job queue lives in-process, and SQLite and uploaded PDFs live on disk.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ANTOVA_DATABASE_URL=sqlite:////data/antova.db \
    ANTOVA_TENDERS_DIR=/data/tenders \
    PORT=8000

WORKDIR /app
COPY antova_requirements.txt .
RUN pip install --no-cache-dir -r antova_requirements.txt

COPY . .
RUN useradd --create-home --uid 10001 antova \
    && mkdir -p /data \
    && chown -R antova:antova /data \
    && chmod +x deploy/entrypoint.sh
USER antova

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8000\")}/api/health', timeout=4)"

ENTRYPOINT ["deploy/entrypoint.sh"]
