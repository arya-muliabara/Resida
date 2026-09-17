@echo off
setlocal

set "APP_DIR=%~dp0..\.."
pushd "%APP_DIR%" || exit /b 1

if not exist ".venv\Scripts\python.exe" (
  echo Virtualenv belum ada. Jalankan scripts\windows\setup.cmd terlebih dahulu.
  exit /b 1
)

call ".venv\Scripts\python.exe" "scripts\mysql\create_superadmin.py" %*

popd
endlocal
