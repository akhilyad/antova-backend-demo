#!/usr/bin/env bash
set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/frontend"

echo "=========================================================="
echo " Starting Antova Next.js Procurement Workbench"
echo " URL: http://localhost:3000"
echo " Demo URL: http://localhost:3000/demo"
echo " Proxying API to: http://127.0.0.1:8000"
echo "=========================================================="

if [ ! -d "node_modules" ]; then
    echo "First-time setup: installing npm dependencies..."
    npm install
fi

npm run dev
