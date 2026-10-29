# SPJT Kendaraan ASN

Aplikasi monitoring kepatuhan pembayaran PKB kendaraan ASN (Pemprov Kaltim & Pemkot Samarinda).

## Stack
- Next.js 14 (App Router) + Tailwind CSS
- Supabase (Postgres + Auth + RLS)
- Hosting: Netlify
- Generate surat: docx (npm)

## Setup

### 1. Supabase
1. Buat project baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor**, jalankan file di folder `supabase/` berurutan:
   `01_schema.sql` → `02_views.sql` → `03_triggers.sql` → `04_rls.sql` → `05_seed.sql` → `06_import_master_support.sql`.
3. Buka **Authentication → Users → Add user**, buat 1 akun admin (email + password).
   Ini satu-satunya akun yang bisa login ke aplikasi.
4. Salin `Project URL` dan `anon public key` dari **Settings → API**.

### 2. Environment variables
```bash
cp .env.example .env.local
```
Isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

### 3. Jalankan lokal
```bash
npm install
npm run dev
```
Buka `http://localhost:3000`.

### 4. Deploy ke Netlify
1. Push project ini ke GitHub.
2. Di Netlify: **Add new site → Import from Git**, pilih repo ini.
3. Build command & publish directory sudah diatur di `netlify.toml` (otomatis terbaca).
4. Tambahkan environment variable yang sama seperti `.env.local` di **Site settings → Environment variables**.
5. Install plugin `@netlify/plugin-nextjs` (biasanya otomatis terpasang lewat `netlify.toml`).

## Struktur menu

| Menu | Path | Akses |
|---|---|---|
| Dashboard | `/` | Publik (read-only) |
| Data OPD | `/opd`, `/opd/[id]` | Admin |
| Data Kendaraan | `/kendaraan` | Admin |
| SPJT Hari Ini | `/spjt-hari-ini` | Admin |
| Statistik | `/statistik` | Admin |
| Profiling | `/profiling` | Admin |
| Riwayat SPJT | `/riwayat-spjt` | Admin |
| Histori Data | `/histori` | Admin |
| Import Data | `/import` | Admin |
| Export Data | `/export` | Admin |
| Pengaturan | `/pengaturan` | Admin |

Proteksi akses diatur di `middleware.ts` (redirect ke `/login` bila belum ada sesi Supabase Auth),
dan diperkuat lagi di level database lewat Row Level Security (`supabase/04_rls.sql`) — jadi
walau seseorang mem-bypass UI, tabel dasar tetap tidak bisa diakses tanpa login.

## Status implementasi

**Sudah jalan penuh:**
- Skema database, view status kepatuhan (live, bukan kolom statis), trigger opsen 66% & mutasi OPD otomatis, RLS.
- Dashboard publik (kartu ringkasan, statistik pembayaran, list OPD perlu SPJT).
- Login admin & proteksi route.
- Data OPD (list + filter kategori + search + detail + rekap pajak per jenis + list kendaraan + badge "perlu verifikasi" utk OPD hasil auto-create).
- Data Kendaraan (list + sort + search).
- SPJT Hari Ini, Statistik, Profiling, Riwayat SPJT, Histori Data — tampilan & query sudah jalan.
- **Generate SPJT → docx** (`app/api/spjt/generate/route.ts`) — sudah lengkap: surat halaman 1 +
  lampiran tabel kendaraan halaman 2 + blok tanda tangan, sesuai contoh dokumen yang diberikan.
  Nomor/sifat/hal sengaja dibiarkan sebagai placeholder teks (diisi manual di Srikandi).
- **Import Database Master → `app/api/import/master/route.ts`** — baca file Excel (format kolom
  sheet `clean_datamaster_smd` / `Master Fixed`), upsert OPD (otomatis buat OPD baru + tandai
  `perlu_verifikasi`) & kendaraan, insert transaksi awal utk kendaraan baru yang sudah ada data
  bayar, tandai Non-aktif kendaraan yang hilang dari data terbaru (khusus dalam scope kategori
  yang dipilih saat upload). Kategori OPD (Kota Samarinda / Provinsi Kaltim) dipilih di form
  sebelum upload karena tidak ada di kolom manapun pada file sumber.
  ⚠️ Untuk file berisi ribuan baris, proses ini berjalan dalam 1 request — kalau kena timeout di
  Netlify (batas 10 detik utk function biasa), beri tahu saya untuk dipecah jadi background job.

**Masih perlu dikerjakan (kerangka UI sudah ada, logic backend belum):**
- `app/api/import/transaksi` — parsing file transaksi bulanan (update status bayar per kendaraan).
- `app/api/import/status` — parsing file perubahan status (Dijual/Mutasi/Ganti Nopol/dst), termasuk
  dropdown OPD tujuan saat mutasi pindah OPD.
- `app/api/import/lapor-jual` — parsing kolom NOPOL/KETERANGAN dgn dukungan format lama & typo.
- `app/api/export/*` — generate file `.xlsx` dari masing-masing view/tabel (pakai `exceljs`, sudah ada di `package.json`).
- `app/api/riwayat-spjt/[id]/status` — update status Sudah Dibuat/Dikirim/Diterima.
- `app/kendaraan/ubah-status` — form aksi Dijual/Rusak/Mutasi (dengan dropdown OPD tujuan + opsi tambah OPD baru saat mutasi pindah OPD), insert ke tabel `riwayat_status`.
- Notifikasi in-app (badge jumlah kendaraan baru masuk periode SPJT).
- Statistik bulanan saat ini dihitung di JS dari data mentah — untuk skala data besar, pindahkan ke SQL view/RPC.

Semua endpoint di atas polanya sama: query/insert ke Supabase pakai `lib/supabase/server.ts`,
lalu catat ke tabel `activity_log` supaya muncul di menu Histori Data.
