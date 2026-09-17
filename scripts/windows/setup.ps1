$ErrorActionPreference = "Stop"

$AppDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $AppDir

py -3 -m venv .venv
& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\pip.exe" install -r "backend\requirements.txt"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm tidak ditemukan. Install Node.js LTS terlebih dahulu."
}

Push-Location frontend
npm ci --no-audit --no-fund
npm run build
Pop-Location

New-Item -ItemType Directory -Force -Path uploads | Out-Null
Write-Host "Setup selesai. Copy .env.example ke .env, edit koneksi MySQL, lalu jalankan scripts/windows/run.cmd"
