#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${APP_DIR}"

python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/pip install -r backend/requirements.txt

if command -v npm >/dev/null 2>&1; then
  (cd frontend && npm ci --no-audit --no-fund && npm run build)
else
  echo "npm tidak ditemukan. Install Node.js/npm lalu jalankan build frontend." >&2
  exit 1
fi

mkdir -p uploads
echo "Setup selesai. Copy .env.example ke .env, edit koneksi MySQL, lalu jalankan scripts/linux/run.sh"
