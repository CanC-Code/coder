#!/usr/bin/env sh
# One-command Termux / Linux self-host launcher for Coder IDE
# Usage: ./scripts/serve.sh [port]
set -e

PORT="${1:-8080}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
    echo "[!] python3 not found. In Termux, install it with: pkg install -y python"
    exit 1
fi

export CODER_PORT="$PORT"
echo "[*] Starting Coder IDE self-hosted server on http://127.0.0.1:${PORT}"
echo "[*] Open http://127.0.0.1:${PORT} in your browser (or use GitHub Pages for pure static mode)"
exec python3 "${REPO_ROOT}/core/runtime/dev_server.py"
