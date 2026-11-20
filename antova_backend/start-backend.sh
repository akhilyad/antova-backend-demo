#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"

export ANTOVA_LOCATE_PROVIDER="explabs"
# Local only. Override with your own value; never use this one on a deployed server.
export ANTOVA_REVIEW_TOKEN="${ANTOVA_REVIEW_TOKEN:-dev-review-token-antova}"
export ANTOVA_TENDERS_DIR="$(pwd)/samples"
export ANTOVA_ALLOWED_ORIGINS="http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001"

echo "=========================================================="
echo " Starting Antova FastAPI Auditing Engine"
echo " Host: http://127.0.0.1:8000"
echo " Docs: http://127.0.0.1:8000/docs"
echo " Provider: explabs (replaying verified Pint extraction)"
echo "=========================================================="

if [ -f "venv/bin/uvicorn" ]; then
    venv/bin/uvicorn antova_api:app --host 127.0.0.1 --port 8000 --reload
elif command -v uvicorn &> /dev/null; then
    uvicorn antova_api:app --host 127.0.0.1 --port 8000 --reload
else
    echo "Python uvicorn not found in PATH or local venv."
    echo "Please run: pip install -r antova_requirements.txt"
    exit 1
fi
