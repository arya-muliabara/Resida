@echo off
setlocal

set "APP_DIR=%~dp0..\.."
pushd "%APP_DIR%" || exit /b 1

where mysql >nul 2>nul
if errorlevel 1 (
  echo mysql client tidak ditemukan di PATH.
  echo Install MySQL client atau jalankan dengan full path mysql.exe.
  exit /b 1
)

echo Script ini akan membuat database, tabel, index, foreign key, dan function Resida.
echo Masukkan password root/admin MySQL saat diminta.
mysql -u root -p < "scripts\sql\001_resida_schema_mysql.sql" || exit /b 1

echo Schema database Resida selesai dibuat.
popd
endlocal

