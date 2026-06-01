#!/usr/bin/env bash
# PYAAR - Hidden Hearts launcher (macOS / Linux). Run:  bash run.sh
set -e
cd "$(dirname "$0")"

echo "============================================"
echo "   PYAAR - Hidden Hearts"
echo "============================================"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node 20+ from https://nodejs.org and try again."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run: installing dependencies (needs internet)..."
  npm install
fi

read -r -p "Enter a port [default 8080]: " PORT
PORT="${PORT:-8080}"

echo ""
echo "Starting on http://localhost:$PORT  (Ctrl+C to stop)"
# open the browser (best effort)
( sleep 1; (command -v open >/dev/null && open "http://localhost:$PORT") || (command -v xdg-open >/dev/null && xdg-open "http://localhost:$PORT") ) >/dev/null 2>&1 &

PORT="$PORT" node server/src/index.js
