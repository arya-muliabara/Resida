@echo off
setlocal

set "APP_DIR=%~dp0..\.."
pushd "%APP_DIR%" || exit /b 1

where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher py tidak ditemukan. Install Python 3.12+ dan centang "Add python.exe to PATH".
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm tidak ditemukan. Install Node.js LTS terlebih dahulu.
  exit /b 1
)

py -3 -m venv .venv || exit /b 1
call ".venv\Scripts\python.exe" -m pip install --upgrade pip || exit /b 1
call ".venv\Scripts\pip.exe" install -r "backend\requirements.txt" || exit /b 1

pushd frontend || exit /b 1
call npm ci --no-audit --no-fund || exit /b 1
call npm run build || exit /b 1
popd

if not exist uploads mkdir uploads

echo Setup selesai.
echo Copy .env.example ke .env, edit koneksi MySQL, jalankan scripts\windows\init_db.cmd, lalu scripts\windows\run.cmd

popd
endlocal
