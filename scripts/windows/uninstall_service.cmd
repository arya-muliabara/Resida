@echo off
setlocal

set "APP_DIR=%~dp0..\.."
pushd "%APP_DIR%" || exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\windows\uninstall_service.ps1" || exit /b 1

popd
endlocal

