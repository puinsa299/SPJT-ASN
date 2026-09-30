-- ============================================================================
-- SPJT KENDARAAN ASN — SUPABASE SCHEMA
-- ============================================================================
-- Urutan eksekusi: 01_schema.sql -> 02_views.sql -> 03_triggers.sql -> 04_rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm"; -- untuk fuzzy search nama OPD / nopol

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type kategori_opd as enum ('Pemerintah Provinsi Kalimantan Timur', 'Pemerintah Kota Samarinda');

create type plat_kendaraan as enum ('KT', 'Non KT');

create type status_kendaraan as enum ('Aktif', 'Dijual', 'Mutasi', 'Ganti Nopol', 'Non-aktif');

create type sumber_perubahan_status as enum ('Manual', 'Import Perubahan Status', 'Lapor Jual', 'Import Transaksi');

create type status_spjt as enum ('Sudah Dibuat', 'Sudah Dikirim', 'Sudah Diterima');

create type jenis_import as enum ('Database Master', 'Transaksi Bulanan', 'Perubahan Status', 'Lapor Jual');

-- ----------------------------------------------------------------------------
-- TABEL: opd
-- ----------------------------------------------------------------------------
create table opd (
  id uuid primary key default uuid_generate_v4(),
  nama_opd text not null,
  alamat text,
  kategori kategori_opd not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nama_opd, kategori)
);

create index idx_opd_nama_trgm on opd using gin (nama_opd gin_trgm_ops);
create index idx_opd_kategori on opd (kategori);

-- ----------------------------------------------------------------------------
-- TABEL: kendaraan
-- ----------------------------------------------------------------------------
create table kendaraan (
  id uuid primary key default uuid_generate_v4(),

  -- identitas nopol
  nomor_polisi text not null,              -- format ternormalisasi, contoh: KT8154NJ (tanpa spasi, uppercase)
  nomor_polisi_display text not null,      -- format asli utk ditampilkan, contoh: "KT 8154 NJ"
  nomor_polisi_lama text,                  -- jejak jika pernah ganti nopol

  opd_id uuid not null references opd(id) on delete restrict,

  plat plat_kendaraan not null default 'KT',

  nama_pemilik text,
  jenis text,
  merk text,
  model text,
  tahun int,

  jatuh_tempo date,                        -- nullable: wajib utk plat KT, kosong utk Non KT

  status status_kendaraan not null default 'Aktif',
  keterangan_status text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_jatuh_tempo_kt check (
    (plat = 'KT') or (plat = 'Non KT' and jatuh_tempo is null) or (plat = 'Non KT')
  )
);

create unique index idx_kendaraan_nopol on kendaraan (nomor_polisi);
create index idx_kendaraan_opd on kendaraan (opd_id);
create index idx_kendaraan_status on kendaraan (status);
create index idx_kendaraan_plat on kendaraan (plat);
create index idx_kendaraan_jatuh_tempo on kendaraan (jatuh_tempo);
create index idx_kendaraan_nopol_trgm on kendaraan using gin (nomor_polisi_display gin_trgm_ops);
create index idx_kendaraan_pemilik_trgm on kendaraan using gin (nama_pemilik gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- TABEL: transaksi_pembayaran (histori permanen, tidak pernah ditimpa)
-- ----------------------------------------------------------------------------
create table transaksi_pembayaran (
  id uuid primary key default uuid_generate_v4(),
  kendaraan_id uuid not null references kendaraan(id) on delete cascade,

  tanggal_bayar date not null,             -- dasar realisasi bulanan
  masa_pajak_periode date,                 -- jatuh tempo yang dibayar pada transaksi ini

  pokok_pkb numeric(14,2),
  opsen numeric(14,2),                     -- default dihitung 66% x pokok_pkb via trigger, bisa override dari import
  swdkllj numeric(14,2),
  total numeric(14,2),

  sumber_import_id uuid,                   -- FK ke import_log, ditambahkan setelah tabel import_log dibuat
  created_at timestamptz not null default now()
);

create index idx_transaksi_kendaraan on transaksi_pembayaran (kendaraan_id);
create index idx_transaksi_tanggal_bayar on transaksi_pembayaran (tanggal_bayar);

-- ----------------------------------------------------------------------------
-- TABEL: riwayat_status (histori dijual/mutasi/ganti nopol/non-aktif/aktif kembali)
-- ----------------------------------------------------------------------------
create table riwayat_status (
  id uuid primary key default uuid_generate_v4(),
  kendaraan_id uuid not null references kendaraan(id) on delete cascade,

  status_lama status_kendaraan,
  status_baru status_kendaraan not null,

  opd_asal_id uuid references opd(id),
  opd_tujuan_id uuid references opd(id),   -- diisi khusus utk Mutasi pindah OPD; kosong = mutasi keluar/dijual/dll

  keterangan text,
  sumber sumber_perubahan_status not null default 'Manual',

  tanggal timestamptz not null default now(),
  created_by text
);

create index idx_riwayat_status_kendaraan on riwayat_status (kendaraan_id);
create index idx_riwayat_status_tanggal on riwayat_status (tanggal);

-- ----------------------------------------------------------------------------
-- TABEL: riwayat_spjt
-- ----------------------------------------------------------------------------
create table riwayat_spjt (
  id uuid primary key default uuid_generate_v4(),
  opd_id uuid not null references opd(id) on delete restrict,

  tanggal_terbit date not null default current_date,
  status status_spjt not null default 'Sudah Dibuat',

  file_path text,                          -- referensi ke file .docx yang pernah digenerate

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_riwayat_spjt_opd on riwayat_spjt (opd_id);
create index idx_riwayat_spjt_tanggal on riwayat_spjt (tanggal_terbit);
create index idx_riwayat_spjt_status on riwayat_spjt (status);

-- ----------------------------------------------------------------------------
-- TABEL: spjt_kendaraan (pivot — kendaraan mana saja yang termasuk 1 SPJT)
-- ----------------------------------------------------------------------------
create table spjt_kendaraan (
  id uuid primary key default uuid_generate_v4(),
  riwayat_spjt_id uuid not null references riwayat_spjt(id) on delete cascade,
  kendaraan_id uuid not null references kendaraan(id) on delete cascade,

  -- snapshot nilai pajak saat SPJT diterbitkan (dari transaksi terakhir kendaraan saat itu)
  pokok_pkb_snapshot numeric(14,2),
  opsen_snapshot numeric(14,2),
  swdkllj_snapshot numeric(14,2),
  total_snapshot numeric(14,2),

  unique (riwayat_spjt_id, kendaraan_id)
);

create index idx_spjt_kendaraan_spjt on spjt_kendaraan (riwayat_spjt_id);
create index idx_spjt_kendaraan_kendaraan on spjt_kendaraan (kendaraan_id);

-- ----------------------------------------------------------------------------
-- TABEL: pengaturan_template (single row — kata-kata surat & penandatangan)
-- ----------------------------------------------------------------------------
create table pengaturan_template (
  id uuid primary key default uuid_generate_v4(),

  isi_surat text not null default '',      -- paragraf isi surat, dengan placeholder ${nama_opd} dll
  lampiran_teks text not null default '2 (dua) lembar',

  nama_pengirim text,
  jabatan_pengirim text default 'Kepala',
  nip_pengirim text,

  nama_kepala_uptd text,
  nip_kepala_uptd text,

  nama_pj_jasaraharja text,
  npp_pj_jasaraharja text,

  logo_path text,

  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- TABEL: import_log
-- ----------------------------------------------------------------------------
create table import_log (
  id uuid primary key default uuid_generate_v4(),
  jenis_import jenis_import not null,
  nama_file text not null,

  jumlah_ditambah int not null default 0,
  jumlah_diupdate int not null default 0,
  jumlah_nonaktif int not null default 0,
  jumlah_diabaikan int not null default 0,

  catatan text,
  tanggal_import timestamptz not null default now(),
  created_by text
);

create index idx_import_log_tanggal on import_log (tanggal_import);
create index idx_import_log_jenis on import_log (jenis_import);

alter table transaksi_pembayaran
  add constraint fk_transaksi_import
  foreign key (sumber_import_id) references import_log(id) on delete set null;

-- ----------------------------------------------------------------------------
-- TABEL: activity_log (menu Histori Data — semua aksi)
-- ----------------------------------------------------------------------------
create table activity_log (
  id uuid primary key default uuid_generate_v4(),
  jenis_aksi text not null,                -- 'generate_spjt', 'ubah_status', 'import', 'export', dll
  deskripsi text not null,
  referensi_id uuid,                       -- nullable, bisa mengarah ke kendaraan/opd/import_log/riwayat_spjt
  referensi_tabel text,                    -- nama tabel yang direferensikan, utk lookup dinamis
  created_by text,
  created_at timestamptz not null default now()
);

create index idx_activity_log_tanggal on activity_log (created_at);
create index idx_activity_log_jenis on activity_log (jenis_aksi);
