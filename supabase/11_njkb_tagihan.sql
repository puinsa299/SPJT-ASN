-- ============================================================================
-- 11_njkb_tagihan.sql — jalankan sekali, setelah 01-10
-- ============================================================================
-- Fitur: hitung otomatis Pokok PKB, Opsen, Denda PKB, Denda Opsen, SWDKLLJ,
-- Denda SWDKLLJ, STNK, Plat berbasis tabel referensi NJKB (Pergub) + tabel
-- parameter yang bisa diubah dari aplikasi (menu Pengaturan) tanpa ubah kode.
--
-- CATATAN ASUMSI PENTING (mohon divalidasi sebelum dipakai produksi):
-- 1. "Tunggakan maksimal 5 tahun" diartikan: dari SEMUA periode pajak yang
--    belum dibayar (bisa lebih dari 5 kalau sudah lama menunggak), yang
--    ditagihkan adalah 5 PERIODE PALING BARU (termasuk periode baru yang
--    baru masuk H-60), bukan 5 periode paling lama. Kalau yang dimaksud
--    justru 5 periode paling lama (urutan dari jatuh_tempo tercatat maju),
--    kasih tau, tinggal ganti urutan sort di v_periode_tagihan.
-- 2. Golongan "roda 2" vs "roda 4" (dipakai utk SWDKLLJ & dendanya, serta
--    STNK/Plat) diturunkan dari kategori NJKB yang cocok (RODA 2/RODA 3/
--    RODA 3 PENUMPANG -> roda 2; sisanya -> roda 4). Kalau kendaraan tidak
--    kecocokan kategori NJKB sama sekali, fallback ke field "jenis" (ada
--    kata "motor" -> roda 2).
-- 3. STNK & Plat (PNBP, berlaku 5 tahun) BUTUH tanggal awal STNK per
--    kendaraan, yang BELUM ada datanya sama sekali di sistem ini. Kolom
--    kendaraan.tanggal_awal_stnk ditambahkan tapi akan NULL untuk semua
--    kendaraan sampai datanya diisi/diimport — selama itu STNK & Plat
--    tampil Rp 0 (bukan ditebak). Lihat catatan di aplikasi.
-- 4. Nominal SWDKLLJ & STNK/Plat memakai tarif nasional umum (Permenkeu
--    36/2021 & PP 76/2020) sebagai nilai AWAL di tabel parameter — SILAKAN
--    DICEK & DIUBAH di menu Pengaturan kalau beda dengan yang berlaku.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Kolom tambahan di kendaraan
-- ----------------------------------------------------------------------------
alter table kendaraan add column if not exists kode_merk text;
alter table kendaraan add column if not exists tanggal_awal_stnk date; -- blm ada sumber data, lihat catatan #3

create index if not exists idx_kendaraan_kode_merk on kendaraan (kode_merk);

-- ----------------------------------------------------------------------------
-- Tabel: njkb_ref — hasil import lampiran NJKB (Pergub), satu baris per
-- merk/type/tahun di tiap kategori kendaraan.
-- ----------------------------------------------------------------------------
create table if not exists njkb_ref (
  id uuid primary key default uuid_generate_v4(),

  kategori text not null,       -- SEDAN, JEEP, MINIBUS, MOBIL RODA 3 PENUMPANG, MOBIL RODA 3 BARANG,
                                 -- MIKROBUS, BUS, PICKUP, PICKUP BOX, BLINDVAN, LTRUCK, TRUCK,
                                 -- RODA 2, RODA 3, RODA 3 PENUMPANG
  kode_merk text,
  merk text,
  type text,
  merk_norm text not null,      -- dinormalisasi (upper, tanpa spasi/simbol) utk pencocokan cadangan
  type_norm text not null,
  tahun_buat int not null,

  njkb numeric(16,2) not null,
  bobot numeric(8,4) not null default 1,
  dp_pkb numeric(16,2),         -- NJKB x Bobot, dari file (dipakai langsung kalau ada)

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kunci pencocokan utama: kode_merk + tahun_buat (lintas kategori, karena
-- kode_merk dari BPKAD pada praktiknya sudah unik per kategori kendaraan).
create unique index if not exists idx_njkb_ref_kode_tahun
  on njkb_ref (kode_merk, tahun_buat) where kode_merk is not null;

create index if not exists idx_njkb_ref_fallback on njkb_ref (kategori, tahun_buat);
create index if not exists idx_njkb_ref_merk_trgm on njkb_ref using gin (merk_norm gin_trgm_ops);
create index if not exists idx_njkb_ref_type_trgm on njkb_ref using gin (type_norm gin_trgm_ops);

drop trigger if exists trg_njkb_ref_updated_at on njkb_ref;
create trigger trg_njkb_ref_updated_at before update on njkb_ref
  for each row execute function fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Tabel: parameter_pkb — single row, SEMUA tarif/persentase/batas bulan/
-- tanggal cutoff ada di sini supaya bisa diubah dari menu Pengaturan tanpa
-- ubah kode aplikasi.
-- ----------------------------------------------------------------------------
create table if not exists parameter_pkb (
  id uuid primary key default uuid_generate_v4(),

  tarif_pkb numeric(8,6) not null default 0.005,           -- 0,5% (kendaraan ASN/plat merah; plat hitam 0,8%)
  persentase_opsen numeric(8,6) not null default 0.66,     -- 66%

  tanggal_cutoff_denda date not null default '2025-01-05',

  -- Denda PKB, masa pajak >= tanggal_cutoff_denda
  tarif_denda_pkb_baru numeric(8,6) not null default 0.01, -- 1%/bulan
  maks_bulan_denda_pkb_baru int not null default 24,

  -- Denda PKB, masa pajak < tanggal_cutoff_denda
  tarif_denda_pkb_lama numeric(8,6) not null default 0.02, -- 2%/bulan
  maks_bulan_denda_pkb_lama int not null default 15,
  sanksi_keterlambatan_lama numeric(14,2) not null default 50000,

  -- Denda opsen: sama utk semua masa pajak, tidak ada tiering tanggal
  tarif_denda_opsen numeric(8,6) not null default 0.01,
  maks_bulan_denda_opsen int not null default 24,

  -- SWDKLLJ (JR) nominal per tahun tagih
  swdkllj_roda2 numeric(14,2) not null default 32000,
  swdkllj_roda4 numeric(14,2) not null default 143000,

  -- Denda SWDKLLJ per tahun tagih (kelipatan per 3 bulan, dengan maksimal)
  denda_swdkllj_roda2_per_kelipatan numeric(14,2) not null default 8000,
  denda_swdkllj_roda2_maks_per_tahun numeric(14,2) not null default 32000,
  denda_swdkllj_roda4_per_kelipatan numeric(14,2) not null default 35000,
  denda_swdkllj_roda4_maks_per_tahun numeric(14,2) not null default 100000,
  maks_tahun_denda_jr int not null default 5,

  -- STNK & Plat (PNBP), berlaku 5 tahun, dihitung dari tanggal_awal_stnk
  stnk_roda2 numeric(14,2) not null default 100000,
  stnk_roda4 numeric(14,2) not null default 200000,
  plat_roda2 numeric(14,2) not null default 60000,
  plat_roda4 numeric(14,2) not null default 100000,

  maks_tahun_tunggakan int not null default 5,

  updated_at timestamptz not null default now()
);

insert into parameter_pkb (id)
  select uuid_generate_v4()
  where not exists (select 1 from parameter_pkb);

drop trigger if exists trg_parameter_pkb_updated_at on parameter_pkb;
create trigger trg_parameter_pkb_updated_at before update on parameter_pkb
  for each row execute function fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Fungsi bantu
-- ----------------------------------------------------------------------------

-- Normalisasi teks (merk/type) utk pencocokan cadangan: upper, buang spasi
-- & simbol, rapikan spasi ganda.
create or replace function fn_normalize_text(t text)
returns text language sql immutable as $$
  select upper(regexp_replace(trim(coalesce(t, '')), '[^A-Za-z0-9]+', ' ', 'g'));
$$;

-- Petakan field bebas "jenis" kendaraan (dari import existing, tulisannya
-- macam-macam) -> salah satu dari 14 kategori sheet NJKB. Urutan WHEN
-- penting: yang lebih spesifik dicek lebih dulu. Tidak cocok -> null
-- (dipakai utk fallback ke pokok BPKAD).
create or replace function fn_jenis_to_kategori_njkb(jenis text)
returns text language sql immutable as $$
  select case
    when jenis is null then null
    when jenis ilike '%pickup%box%' or jenis ilike '%pick up%box%' then 'PICKUP BOX'
    when jenis ilike '%blind%van%' or jenis ilike '%blindvan%' then 'BLINDVAN'
    when jenis ilike '%mikrobus%' or jenis ilike '%microbus%' then 'MIKROBUS'
    when jenis ilike '%minibus%' then 'MINIBUS'
    when jenis ilike '%ltruck%' or jenis ilike '%light truck%' or jenis ilike '%l truck%' then 'LTRUCK'
    when jenis ilike '%truck%' or jenis ilike '%truk%' then 'TRUCK'
    when jenis ilike '%bus%' then 'BUS'
    when jenis ilike '%jeep%' or jenis ilike '%suv%' then 'JEEP'
    when jenis ilike '%sedan%' then 'SEDAN'
    when jenis ilike '%pickup%' or jenis ilike '%pick up%' then 'PICKUP'
    when jenis ilike '%roda%3%penumpang%' or jenis ilike '%r3%penumpang%' then 'MOBIL RODA 3 PENUMPANG'
    when jenis ilike '%roda%3%barang%' or jenis ilike '%r3%barang%' then 'MOBIL RODA 3 BARANG'
    when jenis ilike '%roda%3%' or jenis ilike '%bajaj%' or jenis ilike '%r3%' then 'RODA 3'
    when jenis ilike '%roda%2%' or jenis ilike '%sepeda motor%' or jenis ilike '%motor%' then 'RODA 2'
    when jenis ilike '%minibus%' or jenis ilike '%mobil penumpang%' then 'MINIBUS'
    else null
  end;
$$;

-- Jumlah bulan terlambat dari tanggal_jatuh_tempo ke tanggal_acuan (default
-- hari ini), bagian bulan dihitung penuh (round up). 0 kalau belum jatuh tempo.
create or replace function fn_bulan_telat(jatuh_tempo date, acuan date default current_date)
returns int language sql immutable as $$
  select case
    when jatuh_tempo is null or acuan <= jatuh_tempo then 0
    else
      ((extract(year from acuan)::int - extract(year from jatuh_tempo)::int) * 12
       + (extract(month from acuan)::int - extract(month from jatuh_tempo)::int))
      + case when extract(day from acuan)::int > extract(day from jatuh_tempo)::int then 1 else 0 end
  end
$$;

-- ----------------------------------------------------------------------------
-- fn_match_njkb — pencocokan 1 kendaraan -> baris njkb_ref terbaik.
-- Ditulis sebagai fungsi (bukan langsung SQL view) supaya pencarian cadangan
-- (trigram similarity, lebih berat) HANYA dijalankan kalau pencocokan
-- persis (kode_merk + tahun) tidak ketemu — penting utk performa karena
-- mayoritas kendaraan akan cocok via kode_merk.
-- ----------------------------------------------------------------------------
create or replace function fn_match_njkb(
  p_kode_merk text, p_tahun int, p_jenis text, p_merk text, p_model text
)
returns table(njkb_ref_id uuid, kategori text, njkb numeric, bobot numeric, dp_pkb numeric, match_exact boolean)
language plpgsql stable as $$
begin
  if p_kode_merk is not null and p_tahun is not null then
    return query
      select nr.id, nr.kategori, nr.njkb, nr.bobot, coalesce(nr.dp_pkb, nr.njkb * nr.bobot), true
      from njkb_ref nr
      where nr.kode_merk = p_kode_merk and nr.tahun_buat = p_tahun
      limit 1;
    if found then return; end if;
  end if;

  if p_tahun is not null then
    return query
      select nr.id, nr.kategori, nr.njkb, nr.bobot, coalesce(nr.dp_pkb, nr.njkb * nr.bobot), false
      from njkb_ref nr
      where nr.tahun_buat = p_tahun
        and nr.kategori = fn_jenis_to_kategori_njkb(p_jenis)
        and (
          fn_normalize_text(p_merk) = nr.merk_norm
          or similarity(nr.merk_norm, fn_normalize_text(p_merk)) > 0.45
        )
        and (
          fn_normalize_text(p_model) = nr.type_norm
          or similarity(nr.type_norm, fn_normalize_text(p_model)) > 0.35
        )
      order by
        similarity(nr.merk_norm, fn_normalize_text(p_merk))
        + similarity(nr.type_norm, fn_normalize_text(p_model)) desc
      limit 1;
  end if;
  return;
end;
$$;

create or replace view v_njkb_match as
select
  k.id as kendaraan_id,
  m.njkb_ref_id,
  m.kategori,
  m.njkb,
  m.bobot,
  m.dp_pkb,
  m.match_exact
from kendaraan k
left join lateral fn_match_njkb(k.kode_merk, k.tahun, k.jenis, k.merk, k.model) m on true;

-- ----------------------------------------------------------------------------
-- v_pokok_pkb_kendaraan — pokok PKB per tahun (konstan selama NJKB sama),
-- golongan roda, dan data pendukung lain per kendaraan aktif plat KT.
-- ----------------------------------------------------------------------------
create or replace view v_pokok_pkb_kendaraan as
select
  k.id as kendaraan_id,
  k.jenis,
  k.merk,
  k.model,
  k.tahun,
  k.kode_merk,
  k.tanggal_awal_stnk,
  nm.njkb_ref_id,
  nm.kategori as njkb_kategori,
  nm.njkb,
  nm.bobot,
  nm.dp_pkb,
  nm.match_exact,
  (nm.dp_pkb is null) as pakai_fallback_bpkad,
  case
    when nm.dp_pkb is not null
      then round(nm.dp_pkb * (select tarif_pkb from parameter_pkb limit 1), 2)
    else coalesce(vp.pokok_pkb, 0)
  end as pokok_pkb_per_tahun,
  case
    when nm.kategori in ('RODA 2', 'RODA 3', 'RODA 3 PENUMPANG', 'MOBIL RODA 3 PENUMPANG', 'MOBIL RODA 3 BARANG') then 'RODA2'
    when nm.kategori is null and k.jenis ilike '%motor%' then 'RODA2'
    else 'RODA4'
  end as golongan_roda
from kendaraan k
left join v_njkb_match nm on nm.kendaraan_id = k.id
left join v_kendaraan_pembayaran_terakhir vp on vp.kendaraan_id = k.id
where k.status = 'Aktif' and k.plat = 'KT';

-- ----------------------------------------------------------------------------
-- v_periode_tagihan — periode (tahun pajak) yang belum lunas per kendaraan,
-- maksimal `maks_tahun_tunggakan` periode PALING BARU (lihat catatan #1 di
-- atas file ini), termasuk periode baru yang baru masuk H-60 (belum telat,
-- bulan_telat akan 0 untuk periode itu nanti di view berikutnya).
-- ----------------------------------------------------------------------------
create or replace view v_periode_tagihan as
with kend as (
  select k.id as kendaraan_id, k.jatuh_tempo
  from kendaraan k
  where k.status = 'Aktif' and k.plat = 'KT' and k.jatuh_tempo is not null
),
bayar_terakhir as (
  select kendaraan_id, max(tanggal_bayar_terakhir) as tanggal_bayar_terakhir
  from v_kendaraan_pembayaran_terakhir
  group by kendaraan_id
),
kandidat as (
  select
    kd.kendaraan_id,
    (kd.jatuh_tempo + (gs || ' years')::interval)::date as tanggal_jatuh_tempo_periode
  from kend kd
  cross join generate_series(0, 20) as gs -- margin jauh lebih dari cukup; hasil tetap dibatasi maks_tahun_tunggakan di bawah
),
tersaring as (
  select
    kd.kendaraan_id,
    kd.tanggal_jatuh_tempo_periode,
    row_number() over (partition by kd.kendaraan_id order by kd.tanggal_jatuh_tempo_periode desc) as urutan_terbaru
  from kandidat kd
  left join bayar_terakhir bt on bt.kendaraan_id = kd.kendaraan_id
  where kd.tanggal_jatuh_tempo_periode <= current_date + interval '60 days'
    and (bt.tanggal_bayar_terakhir is null or kd.tanggal_jatuh_tempo_periode > bt.tanggal_bayar_terakhir)
)
select
  kendaraan_id,
  tanggal_jatuh_tempo_periode,
  (tanggal_jatuh_tempo_periode > current_date) as periode_baru_h60,
  urutan_terbaru
from tersaring
where urutan_terbaru <= (select maks_tahun_tunggakan from parameter_pkb limit 1);

-- ----------------------------------------------------------------------------
-- v_tagihan_pkb_periode — rincian per periode (per tahun pajak) per
-- kendaraan: pokok, opsen, denda pkb, denda opsen, swdkllj, denda swdkllj,
-- stnk+plat (kalau tahun STNK-nya pas siklus 5 tahun & datanya ada).
-- ----------------------------------------------------------------------------
create or replace view v_tagihan_pkb_periode as
with pokok as materialized (
  -- MATERIALIZED wajib di sini: tanpa ini, planner Postgres cenderung
  -- "inline" view ini dan menjalankan ULANG pencocokan NJKB (fn_match_njkb)
  -- utk SETIAP baris periode (bisa 5x per kendaraan) alih-alih sekali per
  -- kendaraan — pada 2000+ kendaraan ini beda antara <1 detik vs puluhan
  -- detik (sudah diuji langsung, lihat catatan pengujian terpisah).
  select * from v_pokok_pkb_kendaraan
),
param as materialized (
  select * from parameter_pkb limit 1
),
periode as (
  select pt.*, fn_bulan_telat(pt.tanggal_jatuh_tempo_periode) as bulan_telat
  from v_periode_tagihan pt
)
select
  p.kendaraan_id,
  p.urutan_terbaru,
  p.tanggal_jatuh_tempo_periode,
  p.periode_baru_h60,
  p.bulan_telat,
  pk.pokok_pkb_per_tahun,
  round(pk.pokok_pkb_per_tahun * param.persentase_opsen, 2) as opsen_periode,
  case
    when p.tanggal_jatuh_tempo_periode >= param.tanggal_cutoff_denda then
      round(pk.pokok_pkb_per_tahun * param.tarif_denda_pkb_baru
            * least(p.bulan_telat, param.maks_bulan_denda_pkb_baru), 2)
    else
      round(pk.pokok_pkb_per_tahun * param.tarif_denda_pkb_lama
            * least(p.bulan_telat, param.maks_bulan_denda_pkb_lama), 2)
      + case when p.bulan_telat > 0 then param.sanksi_keterlambatan_lama else 0 end
  end as denda_pkb_periode,
  round(pk.pokok_pkb_per_tahun * param.persentase_opsen * param.tarif_denda_opsen
        * least(p.bulan_telat, param.maks_bulan_denda_opsen), 2) as denda_opsen_periode,
  case when pk.golongan_roda = 'RODA2' then param.swdkllj_roda2 else param.swdkllj_roda4 end as swdkllj_periode,
  case
    when pk.golongan_roda = 'RODA2' then
      least(ceil(p.bulan_telat / 3.0) * param.denda_swdkllj_roda2_per_kelipatan,
            param.denda_swdkllj_roda2_maks_per_tahun)
    else
      least(ceil(p.bulan_telat / 3.0) * param.denda_swdkllj_roda4_per_kelipatan,
            param.denda_swdkllj_roda4_maks_per_tahun)
  end as denda_swdkllj_periode,
  case
    when pk.tanggal_awal_stnk is not null
      and mod(extract(year from p.tanggal_jatuh_tempo_periode)::int - extract(year from pk.tanggal_awal_stnk)::int, 5) = 0
    then (case when pk.golongan_roda = 'RODA2' then param.stnk_roda2 else param.stnk_roda4 end)
    else 0
  end as stnk_periode,
  case
    when pk.tanggal_awal_stnk is not null
      and mod(extract(year from p.tanggal_jatuh_tempo_periode)::int - extract(year from pk.tanggal_awal_stnk)::int, 5) = 0
    then (case when pk.golongan_roda = 'RODA2' then param.plat_roda2 else param.plat_roda4 end)
    else 0
  end as plat_periode
from periode p
join pokok pk on pk.kendaraan_id = p.kendaraan_id
cross join param;

-- ----------------------------------------------------------------------------
-- v_tagihan_pkb — total per kendaraan, dipakai di dashboard, form SPJT,
-- dan export. Dihitung LIVE setiap kali di-query (tidak disimpan statis).
-- ----------------------------------------------------------------------------
create or replace view v_tagihan_pkb as
select
  kendaraan_id,
  count(*) as jumlah_periode_tertagih,
  bool_or(periode_baru_h60) as ada_periode_baru_h60,
  sum(pokok_pkb_per_tahun) as total_pokok_pkb,
  sum(denda_pkb_periode) as total_denda_pkb,
  sum(opsen_periode) as total_opsen,
  sum(denda_opsen_periode) as total_denda_opsen,
  sum(swdkllj_periode) as total_swdkllj,
  sum(denda_swdkllj_periode) filter (
    where urutan_terbaru <= (select maks_tahun_denda_jr from parameter_pkb limit 1)
  ) as total_denda_swdkllj,
  sum(stnk_periode) as total_stnk,
  sum(plat_periode) as total_plat,
  sum(pokok_pkb_per_tahun) + sum(denda_pkb_periode) + sum(opsen_periode) + sum(denda_opsen_periode)
    + sum(swdkllj_periode)
    + sum(denda_swdkllj_periode) filter (
        where urutan_terbaru <= (select maks_tahun_denda_jr from parameter_pkb limit 1)
      )
    + sum(stnk_periode) + sum(plat_periode) as total_tagihan
from v_tagihan_pkb_periode
group by kendaraan_id;

-- ----------------------------------------------------------------------------
-- Tambah angka potensi tunggakan ke dashboard
-- ----------------------------------------------------------------------------
create or replace view v_dashboard_cards as
select
  (select count(distinct opd_id) from v_kendaraan_status where masuk_periode_spjt) as opd_spjt_hari_ini,
  (select count(*) from kendaraan where status = 'Aktif') as total_kendaraan_terdata,
  (select count(*) from v_kendaraan_status where lewat_jatuh_tempo) as kendaraan_lewat_jatuh_tempo,
  (select count(*) from v_kendaraan_status where status_kepatuhan = 'Sudah Bayar') as sudah_bayar_periode_berjalan,
  (select count(*) from v_kendaraan_status where plat = 'Non KT') as total_kendaraan_non_kt,
  (select coalesce(sum(total_pokok_pkb), 0) from v_tagihan_pkb) as potensi_tunggakan_pokok_pkb,
  (select count(*) from v_tagihan_pkb) as jumlah_kendaraan_menunggak;
