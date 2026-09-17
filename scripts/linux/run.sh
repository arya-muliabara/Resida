#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${APP_DIR}"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

APP_PORT="${APP_PORT:-8082}"
APP_HOST="${APP_HOST:-0.0.0.0}"
FORWARDED_ALLOW_IPS="${FORWARDED_ALLOW_IPS:-127.0.0.1}"
UPLOAD_DIR="${UPLOAD_DIR:-uploads}"
mkdir -p "${UPLOAD_DIR}"
exec .venv/bin/python -m uvicorn app.main:app \
  --app-dir backend \
  --host "${APP_HOST}" \
  --port "${APP_PORT}" \
  --proxy-headers \
  --forwarded-allow-ips "${FORWARDED_ALLOW_IPS}"
