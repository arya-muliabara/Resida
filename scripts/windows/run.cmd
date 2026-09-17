@echo off
setlocal

set "APP_DIR=%~dp0..\.."
pushd "%APP_DIR%" || exit /b 1

set "APP_PORT=8082"
set "APP_HOST=0.0.0.0"
set "APP_PUBLIC_PATH="
set "FORWARDED_ALLOW_IPS=127.0.0.1"
set "UPLOAD_DIR=uploads"
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /i "%%A"=="APP_PORT" set "APP_PORT=%%B"
    if /i "%%A"=="APP_HOST" set "APP_HOST=%%B"
    if /i "%%A"=="APP_PUBLIC_PATH" set "APP_PUBLIC_PATH=%%B"
    if /i "%%A"=="FORWARDED_ALLOW_IPS" set "FORWARDED_ALLOW_IPS=%%B"
    if /i "%%A"=="UPLOAD_DIR" set "UPLOAD_DIR=%%B"
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo Virtualenv belum ada. Jalankan scripts\windows\setup.cmd terlebih dahulu.
  exit /b 1
)

if not exist "%UPLOAD_DIR%" mkdir "%UPLOAD_DIR%"

echo Menjalankan Resida di http://%APP_HOST%:%APP_PORT%
if not "%APP_PUBLIC_PATH%"=="" echo Public path reverse proxy: %APP_PUBLIC_PATH%
call ".venv\Scripts\python.exe" -m uvicorn app.main:app --app-dir backend --host %APP_HOST% --port %APP_PORT% --proxy-headers --forwarded-allow-ips %FORWARDED_ALLOW_IPS%

popd
endlocal
