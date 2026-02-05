#!/usr/bin/env bash
# Web Synth - 開発用 HTTP サーバー（ES モジュールは file:// だと CORS で弾かれるため）
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8000}"
echo "Serving at http://localhost:${PORT}/"
echo "Open http://localhost:${PORT}/ in your browser."
echo "Press Ctrl+C to stop."
if command -v python3 &>/dev/null; then
  exec python3 -m http.server "$PORT"
elif command -v python &>/dev/null; then
  exec python -m SimpleHTTPServer "$PORT"
else
  echo "Error: Python not found. Install Python or use another HTTP server." >&2
  exit 1
fi
