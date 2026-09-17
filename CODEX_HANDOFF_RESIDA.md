# CODEX HANDOFF - RESIDA

Gunakan file ini untuk melanjutkan pekerjaan Resida di PC lain dengan Codex.

## Update Terbaru - 2026-08-09

Status terakhir project:

- Frontend sudah dibuild ulang dan berhasil.
- Service worker frontend sekarang `resida-v4`.
- Blank page saat navigasi ke `Booking`, `Voting`, `Profil`, `Surat`, dan menu lain sudah ditangani.
- Frontend sekarang punya `ErrorBoundary`, sehingga runtime error di satu menu tidak membuat seluruh aplikasi menjadi halaman putih.
- Response list dari API sekarang dinormalisasi dengan helper `asArray()`, supaya `.map()` / `.filter()` tidak crash ketika API mengembalikan error, null, atau struktur tidak sesuai.
- `superadmin` sekarang otomatis diarahkan ke layar `Admin` saja. Menu penghuni tidak tampil untuk superadmin, sehingga superadmin tidak memanggil endpoint komplek seperti `/api/news` yang butuh `complex_id`.
- Build terbaru menghasilkan asset `frontend/dist/assets/index-DQ2GFTjB.js` dan `frontend/dist/assets/index-id-N0Xcl.css` pada mesin asal ini.
- Preview static build terbaru pernah dicek di Codex dan halaman login render tanpa console error.

Jika di PC/server lain masih terlihat blank page atau console masih menunjuk bundle lama seperti `index-X-EzV6Ga.js` / `index-IJtjRJ1o.js`, itu hampir pasti cache/service worker/browser masih memakai build lama. Lakukan:

```text
DevTools -> Application -> Service Workers -> Unregister
```

Lalu refresh dengan:

```text
Ctrl + F5
```

Setelah pindah PC atau deploy ulang, selalu jalankan ulang build frontend:

```bash
cd frontend
npm ci --no-audit --no-fund
npm run build
```

## Cara Pakai Di PC Lain

1. Copy seluruh folder project `SAA-Resida` ke PC tujuan.
2. Buka Codex dari root folder project tersebut.
3. Berikan instruksi ke Codex:

```text
Baca CODEX_HANDOFF_RESIDA.md dulu, lalu lanjutkan pekerjaan project Resida berdasarkan konteks di file tersebut.
```

4. Jika file source tidak berada di path yang sama, beri tahu Codex path baru root project-nya.

## Lokasi Project Saat Ini

Path asal saat file ini dibuat:

```text
/Users/arya/Library/CloudStorage/GoogleDrive-aryazx@gmail.com/My Drive/011. STARTUP_PROJECT/GIT_DEVELOPMENT/SAA-Resida
```

Di PC lain path boleh berbeda. Yang penting Codex dijalankan dari root folder project.

## Ringkasan Project

Resida adalah aplikasi PWA manajemen komunitas perumahan yang dibuat dari dokumen FSD.

Stack:

- Backend: Python FastAPI, SQLAlchemy, PyMySQL, JWT auth.
- Frontend: React + Vite PWA.
- Database: MySQL existing milik user.
- Deployment utama: service web langsung, bukan Docker.
- Reverse proxy:
  - Windows: IIS URL Rewrite + ARR.
  - Linux: Apache reverse proxy.

Frontend dependency sudah dipin agar tidak mengambil Vite/Rolldown `latest`:

```text
vite 5.4.19
@vitejs/plugin-react 4.3.4
react 18.3.1
react-dom 18.3.1
typescript 5.6.3
```

## Struktur Penting

```text
backend/                         FastAPI app
frontend/                        React PWA
frontend/dist/                   hasil build frontend
scripts/sql/001_resida_schema_mysql.sql
scripts/mysql/create_resida_mysql_user.sql
scripts/mysql/create_superadmin.py
scripts/linux/setup.sh
scripts/linux/run.sh
scripts/linux/create_superadmin.sh
scripts/linux/resida.service.example
scripts/windows/setup.cmd
scripts/windows/run.cmd
scripts/windows/run.ps1
scripts/windows/init_db.cmd
scripts/windows/create_superadmin.cmd
scripts/windows/install_service.cmd
scripts/iis/web.config.example
scripts/apache/resida-apache.conf.example
README.md
.env.example
```

## Status Fitur Utama

Fitur yang sudah digenerate/diimplementasikan:

- Login JWT.
- Role user:
  - `superadmin`
  - `administrator`
  - `penghuni`
- Registrasi penghuni:
  - penghuni daftar dengan email dan password
  - pilih komplek
  - upload KTP
  - admin komplek melihat request registrasi
  - admin approve/reject dengan notes
  - penghuni login setelah approve
- Login tidak memilih komplek. Komplek ikut dari akun/registrasi.
- Superadmin membuat komplek dan user admin/penghuni.
- Admin mengelola request registrasi per komplek.
- Upload file:
  - KTP registrasi
  - dokumen profil
  - lampiran surat
- File upload bisa dibuka dari UI melalui link.
- Modul awal:
  - Home/news
  - booking fasilitas
  - voting
  - profil
  - surat menyurat
  - registrasi admin
  - superadmin

Catatan UI terbaru:

- Tombol demo login `Superadmin`, `Admin`, `Penghuni` sudah dihapus.
- Email/password login default sudah dikosongkan.
- Role tidak dipilih saat login. Role berasal dari akun di database.
- Superadmin hanya melihat menu `Admin`.
- Administrator dan penghuni melihat menu sesuai role dan komplek miliknya.
- Error layar sekarang ditampilkan sebagai pesan di halaman, bukan blank page total.

## Environment Utama

File contoh ada di `.env.example`.

Contoh direct/local:

```env
APP_HOST=0.0.0.0
APP_PORT=8082
APP_BASE_URL=http://IP_SERVER:8082
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

Contoh reverse proxy sub-path, misalnya `https://hostname/resida`:

```env
APP_HOST=127.0.0.1
APP_PORT=8082
APP_BASE_URL=https://hostname/resida
APP_PUBLIC_PATH=/resida
FORWARDED_ALLOW_IPS=127.0.0.1
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

Penting:

- `APP_HOST=127.0.0.1` membuat port backend tidak terbuka ke public/network.
- IIS/Apache tetap bisa proxy ke `http://127.0.0.1:8082`.
- App tetap bisa dibuka langsung dari server melalui `http://localhost:8082`.
- Jika `APP_PUBLIC_PATH=/resida`, public URL menjadi `https://hostname/resida`.
- Upload URL public menjadi `https://hostname/resida/uploads/...`.

## Database

SQL schema lengkap:

```text
scripts/sql/001_resida_schema_mysql.sql
```

Script ini membuat:

- database `db_resida`
- semua table master/transaksi
- index, foreign key, unique key
- function `fn_resida_booking_conflict(...)`

Jalankan:

```bash
mysql -u root -p < scripts/sql/001_resida_schema_mysql.sql
```

Jika perlu membuat user MySQL aplikasi:

```bash
mysql -u root -p < scripts/mysql/create_resida_mysql_user.sql
```

Windows helper:

```cmd
scripts\windows\create_mysql_user.cmd
scripts\windows\init_db.cmd
```

Membuat superadmin awal setelah schema dibuat:

```cmd
scripts\windows\create_superadmin.cmd
```

atau:

```bash
scripts/linux/create_superadmin.sh
```

Override email/password:

```cmd
scripts\windows\create_superadmin.cmd --email owner@example.com --password "PasswordKuat123!" --name "Owner Resida"
```

Script ini membaca koneksi MySQL dari `.env`, membuat bcrypt password, lalu insert/update user dengan role `superadmin`.

## Menjalankan Di Windows

Setup:

```cmd
copy .env.example .env
notepad .env
scripts\windows\setup.cmd
scripts\windows\init_db.cmd
```

Run manual:

```cmd
scripts\windows\run.cmd
```

Install Windows Service:

```cmd
scripts\windows\install_service.cmd
```

Test:

```cmd
curl http://localhost:8082/api/health
curl http://localhost:8082/resida/api/health
```

Troubleshooting Windows:

- Jika muncul error `Cannot find native binding`, `@rolldown/binding-win32-x64-msvc`, atau `EBADENGINE npm@12`, pastikan `frontend/package.json` dan `frontend/package-lock.json` terbaru sudah tercopy, lalu jalankan:

```cmd
cd C:\00_CORE\001_SAA_APP\SAA-Resida\frontend
rmdir /s /q node_modules
npm ci --no-audit --no-fund
npm run build
```

- Jangan upgrade ke `npm@12` jika Node.js masih `v22.11.0`. Gunakan Node.js LTS atau Node.js `22.22.2+` jika ingin npm terbaru.
- Jika `scripts\windows\run.cmd` pernah error `Got unexpected extra arguments`, gunakan script terbaru. Wildcard `*` untuk Uvicorn sudah diganti menjadi `FORWARDED_ALLOW_IPS=127.0.0.1`.
- Jika login `superadmin@resida.local` pernah error `422 Unprocessable Content`, pastikan backend terbaru dipakai. Schema email sudah diganti dari `EmailStr` ke validasi internal agar domain `.local` diterima.
- Jika halaman menjadi blank setelah pindah menu, pastikan file `frontend/dist/` sudah dari build terbaru dan browser tidak memakai service worker lama. Service worker terbaru adalah `resida-v4`.

## Reverse Proxy IIS Windows

Contoh file:

```text
scripts/iis/web.config.example
```

Contoh target proxy:

```xml
<action type="Rewrite" url="http://localhost:8082/resida/{R:1}" />
```

Jika IIS melepas prefix application sebelum proxy, boleh pakai:

```xml
<action type="Rewrite" url="http://localhost:8082/{R:1}" />
```

Backend mendukung kedua pola:

- `/api/...`
- `/resida/api/...`

IIS requirements:

- IIS URL Rewrite
- Application Request Routing (ARR)
- ARR proxy enabled
- allowed server variables jika memakai `serverVariables`:
  - `HTTP_X_FORWARDED_PROTO`
  - `HTTP_X_FORWARDED_HOST`

## Menjalankan Di Linux

Setup:

```bash
cp .env.example .env
nano .env
scripts/linux/setup.sh
mysql -u root -p < scripts/sql/001_resida_schema_mysql.sql
```

Run manual:

```bash
scripts/linux/run.sh
```

Systemd:

```bash
sudo useradd --system --home /opt/resida --shell /usr/sbin/nologin resida
sudo chown -R resida:resida /opt/resida
sudo cp /opt/resida/scripts/linux/resida.service.example /etc/systemd/system/resida.service
sudo systemctl daemon-reload
sudo systemctl enable --now resida
```

Test:

```bash
curl http://127.0.0.1:8082/api/health
curl http://127.0.0.1:8082/resida/api/health
```

## Reverse Proxy Apache Linux

Contoh file:

```text
scripts/apache/resida-apache.conf.example
```

Enable module:

```bash
sudo a2enmod proxy proxy_http headers rewrite ssl
sudo systemctl restart apache2
```

Copy dan edit vhost:

```bash
sudo cp /opt/resida/scripts/apache/resida-apache.conf.example /etc/apache2/sites-available/resida.conf
sudo nano /etc/apache2/sites-available/resida.conf
sudo a2ensite resida.conf
sudo apachectl configtest
sudo systemctl reload apache2
```

Yang harus diedit di Apache config:

- `ServerName hostname`
- SSL certificate path
- `/resida` jika application name berbeda
- port `8082` jika `APP_PORT` berbeda

Contoh proxy yang mempertahankan prefix:

```apache
ProxyPass /resida/ http://127.0.0.1:8082/resida/ retry=0
ProxyPassReverse /resida/ http://127.0.0.1:8082/resida/
```

Alternatif jika prefix dilepas:

```apache
ProxyPass /resida/ http://127.0.0.1:8082/ retry=0
ProxyPassReverse /resida/ http://127.0.0.1:8082/
```

## Upload File

Config:

```env
UPLOAD_DIR=uploads
UPLOAD_URL_PREFIX=/uploads
```

Contoh Linux:

```env
UPLOAD_DIR=/var/lib/resida/uploads
UPLOAD_URL_PREFIX=/uploads
```

Permission Linux:

```bash
sudo mkdir -p /var/lib/resida/uploads
sudo chown -R resida:resida /var/lib/resida/uploads
```

Contoh Windows:

```env
UPLOAD_DIR=D:/resida/uploads
UPLOAD_URL_PREFIX=/uploads
```

Penting:

- Database menyimpan URL relatif seperti `/uploads/...` atau `/resida/uploads/...` tergantung `APP_PUBLIC_PATH`.
- File fisik harus tetap ada di `UPLOAD_DIR`.
- Saat pindah server, copy juga folder upload.
- Link upload di UI sudah memakai helper agar tetap bisa dibuka dari direct local maupun reverse proxy.

## Build Frontend

Frontend memakai asset relatif, supaya satu build bisa jalan dari:

- `http://localhost:8082`
- `https://hostname/resida`

Build:

```bash
cd frontend
npm run build
```

Output:

```text
frontend/dist/
```

## Preview Yang Pernah Dijalankan Di Codex

Preview lokal pernah dijalankan dengan:

```bash
AUTO_CREATE_TABLES=false SEED_ON_STARTUP=false APP_HOST=127.0.0.1 APP_PORT=8099 .venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8099
```

URL preview:

```text
http://127.0.0.1:8099
```

Catatan:

- Preview login page bisa tampil tanpa DB aktif.
- Endpoint yang butuh DB akan error jika `DB_HOST` belum benar atau MySQL tidak berjalan.
- Saat preview terakhir, `.env` lokal masih menunjuk host MySQL `db`, sehingga endpoint `/api/complexes` gagal karena host `db` tidak dikenal di luar Docker.
- Preview static terakhir untuk build `frontend/dist` berhasil render halaman login tanpa console error. Error `/api/complexes 404` pada preview static adalah normal karena static server tidak menjalankan backend API.

## Verifikasi Terakhir Yang Sudah Lolos

Command yang sudah pernah dijalankan dan sukses:

```bash
npm run build
python3 -m compileall backend/app
bash -n scripts/linux/run.sh scripts/linux/setup.sh
```

Validasi lain:

- Build frontend terakhir sukses setelah fix blank page.
- Static preview dari `frontend/dist` terakhir berhasil memuat halaman login.
- `scripts/iis/web.config.example` valid XML.
- Smoke test sebelumnya membuktikan `http://127.0.0.1:<port>/` dan `http://127.0.0.1:<port>/resida/` bisa berjalan bersamaan saat `APP_PUBLIC_PATH=/resida`.
- Health endpoint root dan sub-path sama-sama OK:
  - `/api/health`
  - `/resida/api/health`

## Catatan Untuk Codex Lanjutan

Prioritas jika melanjutkan:

1. Jangan aktifkan kembali tombol demo role di login.
2. Role berasal dari user database, bukan pilihan di login.
3. Untuk deployment reverse proxy, gunakan `APP_HOST=127.0.0.1`.
4. Untuk akses public sub-path, isi `APP_PUBLIC_PATH=/nama-aplikasi`.
5. Jika user ingin test dashboard penuh, pastikan MySQL running dan `.env` memakai `DB_HOST` yang benar.
6. Jika upload file dites, pastikan `UPLOAD_DIR` writable dan file fisik ikut dipindahkan saat migrasi server.
7. README adalah dokumentasi utama deployment dan sudah mencakup Windows IIS serta Linux Apache.
8. Jika ada laporan blank page, cek console apakah masih memuat bundle lama; jika iya, bersihkan service worker/cache dan rebuild `frontend/dist`.

## File Yang Paling Sering Perlu Dibaca

```text
README.md
.env.example
backend/app/main.py
backend/app/core/config.py
backend/app/services/uploads.py
frontend/src/main.jsx
frontend/vite.config.js
scripts/iis/web.config.example
scripts/apache/resida-apache.conf.example
scripts/sql/001_resida_schema_mysql.sql
```
