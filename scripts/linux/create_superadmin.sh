#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${APP_DIR}"

if [[ ! -x ".venv/bin/python" ]]; then
  echo "Virtualenv belum ada. Jalankan scripts/linux/setup.sh terlebih dahulu." >&2
  exit 1
fi

exec .venv/bin/python scripts/mysql/create_superadmin.py "$@"
