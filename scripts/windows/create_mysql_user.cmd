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

echo Pastikan password di scripts\mysql\create_resida_mysql_user.sql sudah sesuai dengan DB_PASSWORD pada .env.
echo Masukkan password root/admin MySQL saat diminta.
mysql -u root -p < "scripts\mysql\create_resida_mysql_user.sql" || exit /b 1

echo User MySQL aplikasi selesai dibuat atau diperbarui.
popd
endlocal

