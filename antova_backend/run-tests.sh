#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"

export ANTOVA_LOCATE_PROVIDER="explabs"
export ANTOVA_REVIEW_TOKEN="dev-review-token-antova"
export ANTOVA_TENDERS_DIR="$(pwd)/samples"

echo "=========================================================="
echo " Running Antova Test Suite (175 tests)"
echo " Testing Pint rules, SQLite lock-in, API & Breaches"
echo "=========================================================="

if [ -f "venv/bin/pytest" ]; then
    venv/bin/pytest -v
elif command -v pytest &> /dev/null; then
    pytest -v
else
    python3 -m unittest discover -s .
fi
