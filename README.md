# Resida

Resida adalah PWA manajemen komunitas perumahan. Aplikasi berjalan sebagai service web FastAPI yang menyajikan API dan React PWA, terhubung ke MySQL existing milik Anda.

Stack utama:

- Backend: Python, FastAPI, SQLAlchemy, PyMySQL, JWT auth, SMTP log.
- Frontend: React PWA mobile-first.
- Database: MySQL 8.0 utf8mb4.
- Deployment utama: service web langsung di Linux atau Windows, tanpa Docker.

## Struktur Penting

- `backend/` - FastAPI app.
- `frontend/` - React PWA.
- `scripts/sql/001_resida_schema_mysql.sql` - SQL schema lengkap semua tabel dan function database.
- `scripts/linux/setup.sh` - setup dependency Linux.
- `scripts/linux/run.sh` - run service web Linux.
- `scripts/linux/resida.service.example` - contoh systemd service.
- `scripts/windows/setup.cmd` - setup dependency Windows dari Command Prompt.
- `scripts/windows/init_db.cmd` - membuat schema database dari Command Prompt.
- `scripts/windows/run.cmd` - run service web Windows dari Command Prompt.
- `scripts/windows/install_service.cmd` - install Windows Service.
- `scripts/iis/web.config.example` - contoh IIS URL Rewrite reverse proxy.
- `scripts/apache/resida-apache.conf.example` - contoh Apache reverse proxy Linux.

## Environment

Copy file env:

```bash
cp .env.example .env
```

Contoh konfigurasi utama:

```env
APP_HOST=0.0.0.0
APP_PORT=8082
APP_BASE_URL=http://IP_SERVER:8082
# Kosongkan jika aplikasi berjalan di root domain.
# Isi jika diakses dari reverse proxy sub-path, contoh: /resida
APP_PUBLIC_PATH=
ENVIRONMENT=production
AUTO_CREATE_TABLES=false
SEED_ON_STARTUP=true

DB_HOST=localhost
DB_PORT=3306
DB_NAME=db_resida
DB_USER=resida_app
DB_PASSWORD=password_mysql

JWT_SECRET_KEY=ganti_dengan_secret_panjang_random

UPLOAD_DIR=uploads
UPLOAD_URL_PREFIX=/uploads
```

`APP_HOST` adalah alamat bind service. Gunakan `0.0.0.0` jika ingin bisa diakses dari komputer lain secara langsung. Gunakan `127.0.0.1` jika aplikasi hanya boleh diakses lokal oleh reverse proxy seperti IIS.

`APP_PORT` adalah port web aplikasi. Ubah value ini jika ingin menjalankan di port lain.

`APP_BASE_URL` adalah URL publik aplikasi. Untuk IIS reverse proxy dengan alamat `https://hostname/resida`, isi `APP_BASE_URL=https://hostname/resida`.

`APP_PUBLIC_PATH` adalah path aplikasi pada reverse proxy. Untuk alamat `https://hostname/resida`, isi `APP_PUBLIC_PATH=/resida`. Jika aplikasi berjalan langsung di root, kosongkan.

Walaupun `APP_PUBLIC_PATH` diisi untuk IIS, aplikasi tetap bisa dibuka langsung dari service lokal/internal, misalnya `http://localhost:8082` atau `http://IP_INTERNAL:8082`. Backend menyediakan route root dan route sub-path secara bersamaan. Jika `APP_HOST=127.0.0.1`, akses langsung hanya dari mesin server, tetapi reverse proxy IIS di mesin yang sama tetap bisa berjalan.

`AUTO_CREATE_TABLES=false` berarti schema dibuat lewat SQL script, bukan otomatis oleh aplikasi. Jalankan SQL schema sebelum start service.

`SEED_ON_STARTUP=true` akan membuat data awal demo jika superadmin belum ada.

## Konfigurasi Upload File

Lokasi fisik file upload bisa diatur dari `.env`:

```env
UPLOAD_DIR=uploads
UPLOAD_URL_PREFIX=/uploads
```

`UPLOAD_DIR` adalah folder tempat file benar-benar disimpan di server.

Contoh Linux:

```env
UPLOAD_DIR=/var/lib/resida/uploads
UPLOAD_URL_PREFIX=/uploads
```

Buat folder dan beri permission ke user service:

```bash
sudo mkdir -p /var/lib/resida/uploads
sudo chown -R resida:resida /var/lib/resida/uploads
```

Contoh Windows:

```env
UPLOAD_DIR=D:/resida/uploads
UPLOAD_URL_PREFIX=/uploads
```

Buat folder:

```cmd
mkdir D:\resida\uploads
```

Aplikasi akan menyajikan file upload melalui URL:

```text
http://localhost:8082/uploads/...
```

File upload dari registrasi KTP, dokumen profil, dan lampiran surat disimpan sebagai URL relatif `/uploads/...` di database. Selama `UPLOAD_DIR` tetap berisi file fisiknya dan `UPLOAD_URL_PREFIX` tetap `/uploads`, file tersebut akan tetap bisa dibuka dari link di aplikasi.

Jika `APP_BASE_URL` memakai domain/IP server, file upload dapat diakses dari:

```text
http://IP_SERVER:8082/uploads/...
```

Gunakan slash `/` pada path Windows di `.env` agar parsing lebih aman, misalnya `D:/resida/uploads`.

## SQL Database

Jalankan script schema berikut di MySQL existing Anda:

```bash
mysql -u root -p < scripts/sql/001_resida_schema_mysql.sql
```

Script ini membuat:

- database `db_resida`
- seluruh tabel master dan transaksi Resida
- foreign key, unique key, dan index
- function `fn_resida_booking_conflict(...)` untuk pengecekan bentrok booking fasilitas

Jika Anda perlu membuat user MySQL aplikasi:

```bash
mysql -u root -p < scripts/mysql/create_resida_mysql_user.sql
```

Atau wrapper yang membaca `.env`:

```bash
scripts/mysql/create_resida_mysql_user.sh
```

## Buat Superadmin Awal

Jalankan setelah schema database dibuat. Script ini membaca koneksi MySQL dari `.env`, membuat bcrypt password, lalu insert/update user `superadmin`.

Linux:

```bash
scripts/linux/create_superadmin.sh
```

Windows:

```cmd
scripts\windows\create_superadmin.cmd
```

Default akun mengikuti `.env`:

```env
SEED_SUPERADMIN_EMAIL=superadmin@resida.local
SEED_SUPERADMIN_PASSWORD=Resida123!
```

Untuk menentukan akun langsung dari command:

Linux:

```bash
scripts/linux/create_superadmin.sh --email owner@example.com --password "PasswordKuat123!" --name "Owner Resida"
```

Windows:

```cmd
scripts\windows\create_superadmin.cmd --email owner@example.com --password "PasswordKuat123!" --name "Owner Resida"
```

Jika email sudah ada, script akan mengubah user tersebut menjadi `superadmin`, mengaktifkan akun, memverifikasi email, dan mengupdate password.

## Jalankan di Linux

Prasyarat:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip nodejs npm mysql-client
```

Setup dependency:

```bash
cd /opt/resida
cp .env.example .env
nano .env
scripts/linux/setup.sh
```

Jalankan manual:

```bash
scripts/linux/run.sh
```

Cek:

```bash
curl http://localhost:8082/api/health
```

## Install sebagai systemd Service Linux

Contoh lokasi aplikasi: `/opt/resida`.

```bash
sudo useradd --system --home /opt/resida --shell /usr/sbin/nologin resida
sudo chown -R resida:resida /opt/resida
sudo cp /opt/resida/scripts/linux/resida.service.example /etc/systemd/system/resida.service
sudo systemctl daemon-reload
sudo systemctl enable --now resida
sudo systemctl status resida
```

Log:

```bash
sudo journalctl -u resida -f
```

Buka firewall jika memakai UFW:

```bash
sudo ufw allow 8082/tcp
sudo ufw reload
sudo ufw status
```

## Jalankan di Windows dengan CMD

Prasyarat:

- Python 3.12+
- Node.js LTS
- MySQL existing yang bisa diakses dari Windows host
- MySQL client tersedia di PATH jika ingin menjalankan SQL dari CMD

### 1. Buka Command Prompt

Gunakan Command Prompt biasa untuk run manual. Untuk install Windows Service, gunakan Command Prompt sebagai Administrator.

Masuk ke folder aplikasi:

```cmd
cd C:\resida
```

### 2. Buat dan edit `.env`

```cmd
copy .env.example .env
notepad .env
```

Minimal isi seperti ini:

```env
APP_HOST=0.0.0.0
APP_PORT=8082
APP_BASE_URL=http://localhost:8082
APP_PUBLIC_PATH=
ENVIRONMENT=production
AUTO_CREATE_TABLES=false
SEED_ON_STARTUP=true

DB_HOST=localhost
DB_PORT=3306
DB_NAME=db_resida
DB_USER=resida_app
DB_PASSWORD=password_mysql

JWT_SECRET_KEY=ganti_dengan_secret_panjang_random
UPLOAD_DIR=uploads
UPLOAD_URL_PREFIX=/uploads
```

Jika MySQL ada di server lain, ganti `DB_HOST` dengan IP/hostname database.

Jika aplikasi akan diakses dari IIS di `https://hostname/resida`, gunakan:

```env
APP_HOST=127.0.0.1
APP_PORT=8082
APP_BASE_URL=https://hostname/resida
APP_PUBLIC_PATH=/resida
```

### 3. Buat user MySQL aplikasi, jika belum ada

Edit dulu file berikut agar password sama dengan `DB_PASSWORD` di `.env`:

```cmd
notepad scripts\mysql\create_resida_mysql_user.sql
```

Lalu jalankan:

```cmd
scripts\windows\create_mysql_user.cmd
```

Jika user MySQL sudah ada, step ini boleh dilewati.

### 4. Generate semua tabel dan function database

Jalankan:

```cmd
scripts\windows\init_db.cmd
```

Script ini menjalankan:

```cmd
mysql -u root -p < scripts\sql\001_resida_schema_mysql.sql
```

Hasilnya database `db_resida` berisi semua tabel, foreign key, index, unique constraint, dan function `fn_resida_booking_conflict`.

### 5. Buat superadmin awal

Jalankan:

```cmd
scripts\windows\create_superadmin.cmd
```

Atau tentukan email/password sendiri:

```cmd
scripts\windows\create_superadmin.cmd --email owner@example.com --password "PasswordKuat123!" --name "Owner Resida"
```

### 6. Setup dependency aplikasi

```cmd
scripts\windows\setup.cmd
```

Script ini akan:

- membuat virtualenv Python `.venv`
- install dependency backend
- install dependency frontend
- build React PWA ke `frontend/dist`
- membuat folder `uploads`

Jika sebelumnya pernah muncul error frontend seperti `Cannot find native binding`, `@rolldown/binding-win32-x64-msvc`, atau `EBADENGINE npm@12`, bersihkan dependency frontend lalu install ulang dari lock file terbaru:

```cmd
cd C:\00_CORE\001_SAA_APP\SAA-Resida\frontend
rmdir /s /q node_modules
npm ci --no-audit --no-fund
npm run build
cd C:\00_CORE\001_SAA_APP\SAA-Resida
```

Project sudah memakai versi stabil:

```text
vite 5.4.19
@vitejs/plugin-react 4.3.4
react 18.3.1
```

Jangan mengikuti `npm notice` untuk upgrade ke `npm@12` jika Node.js masih `v22.11.0`, karena `npm@12` butuh Node lebih baru. Gunakan Node.js LTS atau Node.js `22.22.2+` jika memang ingin memakai npm terbaru.

### 7. Jalankan aplikasi manual

```cmd
scripts\windows\run.cmd
```

Aplikasi akan jalan di:

```text
http://localhost:8082
http://localhost:8082/docs
```

Cek health:

```cmd
curl http://localhost:8082/api/health
```

Response normal:

```json
{"status":"ok","app":"Resida"}
```

Jika `APP_PUBLIC_PATH=/resida`, health check lokal juga bisa dicek dari:

```cmd
curl http://localhost:8082/resida/api/health
```

Jika sebelumnya muncul error `Got unexpected extra arguments` saat menjalankan `scripts\windows\run.cmd`, pastikan Anda sudah memakai versi script terbaru. Penyebabnya adalah wildcard `*` pada parameter Uvicorn yang di Windows bisa terbaca sebagai daftar file. Script terbaru memakai `FORWARDED_ALLOW_IPS=127.0.0.1` agar aman untuk IIS reverse proxy lokal.

Jika login superadmin pernah mendapat `422 Unprocessable Content` dengan email `superadmin@resida.local`, pastikan backend sudah memakai versi terbaru. Validator email aplikasi sudah disesuaikan agar menerima domain internal seperti `.local`.

Jika registrasi mendapat `422 Unprocessable Content`, biasanya penyebabnya:

- password kurang dari 8 karakter
- belum memilih komplek
- daftar komplek kosong karena database belum aktif atau superadmin belum membuat komplek
- browser masih memakai bundle lama dari service worker

Setelah copy source terbaru, rebuild frontend dan restart service:

```cmd
cd C:\00_CORE\001_SAA_APP\SAA-Resida\frontend
npm run build
cd C:\00_CORE\001_SAA_APP\SAA-Resida
scripts\windows\run.cmd
```

Jika browser masih memanggil file JS lama, buka DevTools lalu lakukan hard refresh atau unregister service worker dari tab `Application > Service Workers`.

### 8. Buka port Windows Firewall

Jika ingin diakses dari komputer lain, buka port `8082` di Windows Firewall. Jalankan Command Prompt sebagai Administrator:

```cmd
netsh advfirewall firewall add rule name="Resida Web 8082" dir=in action=allow protocol=TCP localport=8082
```

Jika port di `.env` diganti, sesuaikan `localport`.

## Reverse Proxy IIS

Gunakan bagian ini jika aplikasi dipublish sebagai IIS application, misalnya:

```text
https://hostname/resida
```

### 1. Edit `.env`

Contoh untuk application name `resida`:

```env
APP_HOST=127.0.0.1
APP_PORT=8082
APP_BASE_URL=https://hostname/resida
APP_PUBLIC_PATH=/resida
UPLOAD_URL_PREFIX=/uploads
```

`UPLOAD_URL_PREFIX` tetap `/uploads`. Aplikasi akan otomatis membentuk URL publik seperti `/resida/uploads/...`.

Dengan `APP_HOST=127.0.0.1`, port `8082` tidak dibuka ke jaringan publik. Aplikasi tetap bisa diakses dari mesin server melalui `http://localhost:8082`, dan IIS tetap bisa meneruskan request publik ke service lokal tersebut.

### 2. Build frontend

Frontend memakai asset relatif, sehingga satu hasil build bisa dibuka dari alamat lokal `http://localhost:8082` dan dari reverse proxy `https://hostname/resida`. Jalankan build setelah setup awal atau setelah ada perubahan source frontend:

```cmd
cd C:\resida\frontend
npm run build
cd C:\resida
```

### 3. Jalankan service lokal

```cmd
scripts\windows\run.cmd
```

Pastikan endpoint lokal aktif:

```cmd
curl http://localhost:8082/resida/api/health
```

### 4. Siapkan IIS

Install komponen IIS yang dibutuhkan:

- IIS URL Rewrite
- Application Request Routing atau ARR, lalu enable proxy

Buat application di IIS dengan alias sesuai `APP_PUBLIC_PATH`, misalnya `resida`.

Jika memakai `serverVariables` seperti contoh `web.config`, tambahkan allowed server variables di IIS URL Rewrite:

- `HTTP_X_FORWARDED_PROTO`
- `HTTP_X_FORWARDED_HOST`

### 5. Pasang `web.config`

Copy contoh:

```cmd
copy scripts\iis\web.config.example C:\inetpub\wwwroot\resida\web.config
```

Edit bagian ini jika application name atau port berbeda:

```xml
<action type="Rewrite" url="http://localhost:8082/resida/{R:1}" />
```

Jika IIS Anda menghapus prefix application sebelum meneruskan request, URL rewrite juga boleh diarahkan ke:

```xml
<action type="Rewrite" url="http://localhost:8082/{R:1}" />
```

Aplikasi mendukung dua pola tersebut.

### 6. Test dari browser

Buka:

```text
https://hostname/resida
https://hostname/resida/api/health
```

File upload akan terbuka dari URL:

```text
https://hostname/resida/uploads/...
```

## Reverse Proxy Apache Linux

Gunakan bagian ini jika aplikasi dipublish melalui Apache di Linux, misalnya:

```text
https://hostname/resida
```

### 1. Edit `.env`

Contoh untuk application name `resida`:

```env
APP_HOST=127.0.0.1
APP_PORT=8082
APP_BASE_URL=https://hostname/resida
APP_PUBLIC_PATH=/resida
UPLOAD_URL_PREFIX=/uploads
```

Dengan `APP_HOST=127.0.0.1`, port backend hanya bisa diakses lokal dari server Linux. Apache tetap bisa meneruskan request ke `http://127.0.0.1:8082`.

### 2. Jalankan service lokal

Jika memakai systemd:

```bash
sudo systemctl restart resida
```

Pastikan endpoint lokal aktif:

```bash
curl http://127.0.0.1:8082/api/health
curl http://127.0.0.1:8082/resida/api/health
```

### 3. Enable module Apache

```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo systemctl restart apache2
```

### 4. Pasang virtual host

Copy contoh:

```bash
sudo cp /opt/resida/scripts/apache/resida-apache.conf.example /etc/apache2/sites-available/resida.conf
sudo nano /etc/apache2/sites-available/resida.conf
```

Edit bagian berikut:

- `ServerName hostname`
- path sertifikat SSL
- `/resida` jika application name berbeda
- port `8082` jika `APP_PORT` berbeda

Aktifkan site:

```bash
sudo a2ensite resida.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

### 5. Test dari browser

Buka:

```text
https://hostname/resida
https://hostname/resida/api/health
```

File upload akan terbuka dari URL:

```text
https://hostname/resida/uploads/...
```

Jika Apache Anda ingin melepas prefix sebelum meneruskan ke backend, ubah `ProxyPass` menjadi:

```apache
ProxyPass /resida/ http://127.0.0.1:8082/ retry=0
ProxyPassReverse /resida/ http://127.0.0.1:8082/
```

Aplikasi mendukung dua pola tersebut, selama `APP_PUBLIC_PATH=/resida` tetap diisi.

## Install sebagai Windows Service

Jalankan Command Prompt sebagai Administrator:

```cmd
cd C:\resida
scripts\windows\install_service.cmd
```

Stop/start/status dari CMD Administrator:

```cmd
net stop ResidaWeb
net start ResidaWeb
sc query ResidaWeb
```

Uninstall service:

```cmd
scripts\windows\uninstall_service.cmd
```

## Ganti Port

Edit `.env`:

```env
APP_PORT=8090
APP_BASE_URL=http://IP_SERVER:8090
```

Restart service:

Linux:

```bash
sudo systemctl restart resida
```

Windows:

```cmd
net stop ResidaWeb
net start ResidaWeb
```

## Akun Demo Seed

Jika `SEED_ON_STARTUP=true`, aplikasi membuat data demo saat startup pertama:

- Superadmin: `superadmin@resida.local` / `Resida123!`
- Administrator: `admin@resida.local` / `Admin123!`
- Penghuni: `penghuni@resida.local` / `Penghuni123!`

Ubah password seed di `.env` sebelum production:

```env
SEED_SUPERADMIN_EMAIL=superadmin@resida.local
SEED_SUPERADMIN_PASSWORD=password_yang_kuat
```

## Flow Registrasi Penghuni

1. Penghuni membuka halaman `Registrasi`, mengisi email dan password, memilih komplek, lalu upload dokumen KTP.
2. Sistem membuat akun penghuni dalam status belum aktif dan membuat request pendaftaran.
3. Administrator komplek menerima notifikasi email dan melihat request pada menu `Daftar` / `Request Pendaftaran`.
4. Administrator memvalidasi data dan dokumen KTP secara manual.
5. Administrator memilih `Approve` atau `Reject` dan wajib mengisi notes.
6. Sistem mengirim email hasil validasi ke penghuni.
7. Jika approved, penghuni dapat login hanya dengan email dan password.

## Catatan Produksi

- Ganti `JWT_SECRET_KEY`, `DB_PASSWORD`, dan konfigurasi SMTP pada `.env`.
- Jalankan SQL schema sebelum service pertama kali dinyalakan.
- Setelah seed awal dibuat, Anda dapat mengubah `SEED_ON_STARTUP=false`.
- Folder `uploads/` harus writable oleh user service.
