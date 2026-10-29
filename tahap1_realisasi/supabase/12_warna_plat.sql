-- ============================================================================
-- 12_warna_plat.sql — jalankan sekali, setelah 11_njkb_tagihan.sql
-- ============================================================================
-- Tarif PKB (0,8% vs 0,5%) tidak sama untuk semua kendaraan ASN di aplikasi
-- ini -- tergantung WARNA PLAT per kendaraan (Merah = dinas/pemerintah,
-- Hitam = pribadi). Data warna plat BELUM ada di sistem manapun (tidak ada
-- di file Database Master), jadi perlu kolom baru + diisi manual (satu-satu
-- lewat form edit kendaraan, ATAU sekaligus lewat import excel No. Polisi +
-- Warna Plat di menu Import Data).
--
-- Kendaraan yang warna platnya BELUM diisi (NULL) untuk sementara dihitung
-- pakai tarif Merah (0,5%) sebagai default, SUPAYA angka di dashboard tidak
-- tiba-tiba jadi Rp 0 sebelum data warna plat lengkap -- tapi jumlah
-- kendaraan yang belum diisi ditampilkan di dashboard supaya kelihatan
-- berapa yang masih butuh dikoreksi.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Kolom warna_plat di kendaraan
-- ----------------------------------------------------------------------------
alter table kendaraan add column if not exists warna_plat text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'kendaraan_warna_plat_check'
  ) then
    alter table kendaraan
      add constraint kendaraan_warna_plat_check check (warna_plat in ('Merah', 'Hitam'));
  end if;
end $$;

create index if not exists idx_kendaraan_warna_plat on kendaraan (warna_plat);

-- ----------------------------------------------------------------------------
-- parameter_pkb: ganti 1 tarif_pkb jadi 2 tarif (merah & hitam)
-- ----------------------------------------------------------------------------
alter table parameter_pkb add column if not exists tarif_pkb_merah numeric(8,6);
alter table parameter_pkb add column if not exists tarif_pkb_hitam numeric(8,6) not null default 0.008; -- 0,8%

-- Pindahkan nilai tarif_pkb lama (yang sudah ada/sudah dikoreksi ke 0,5%) ke
-- tarif_pkb_merah, supaya nilai yang sudah benar di production tidak hilang.
update parameter_pkb set tarif_pkb_merah = coalesce(tarif_pkb_merah, tarif_pkb, 0.005);
alter table parameter_pkb alter column tarif_pkb_merah set default 0.005;
alter table parameter_pkb alter column tarif_pkb_merah set not null;

-- Hapus kolom tarif_pkb lama. Pakai CASCADE karena beberapa view lain masih
-- "mewarisi" kolom ini lewat "select * from parameter_pkb" -- semua view
-- yang kena cascade (v_pokok_pkb_kendaraan, v_tagihan_pkb_periode,
-- v_tagihan_pkb, v_dashboard_cards) DIBUAT ULANG persis di bawah, jadi tidak
-- ada fungsi yang hilang.
alter table parameter_pkb drop column tarif_pkb cascade;

-- ----------------------------------------------------------------------------
-- v_pokok_pkb_kendaraan: tarif sekarang ikut warna_plat per kendaraan.
-- warna_plat NULL (belum diisi) -> dihitung pakai tarif Merah sementara,
-- lihat flag pakai_tarif_default di bawah untuk tahu mana yang masih butuh
-- dikoreksi manual.
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
  k.warna_plat,
  (k.warna_plat is null) as pakai_tarif_default,
  nm.njkb_ref_id,
  nm.kategori as njkb_kategori,
  nm.njkb,
  nm.bobot,
  nm.dp_pkb,
  nm.match_exact,
  (nm.dp_pkb is null) as pakai_fallback_bpkad,
  case
    when nm.dp_pkb is not null
      then round(
        nm.dp_pkb * (
          case
            when k.warna_plat = 'Hitam' then (select tarif_pkb_hitam from parameter_pkb limit 1)
            else (select tarif_pkb_merah from parameter_pkb limit 1) -- 'Merah' atau belum diisi
          end
        ), 2)
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
-- v_tagihan_pkb_periode & v_tagihan_pkb -- DIBUAT ULANG persis sama seperti
-- di 11_njkb_tagihan.sql (TIDAK ada perubahan rumus di sini), karena
-- "alter table parameter_pkb drop column tarif_pkb cascade" di atas ikut
-- menghapus kedua view ini (mereka "mewarisi" kolom tarif_pkb lewat
-- "select * from parameter_pkb").
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
-- Dashboard: tambah jumlah kendaraan yang warna platnya belum diisi
-- ----------------------------------------------------------------------------
create or replace view v_dashboard_cards as
select
  (select count(distinct opd_id) from v_kendaraan_status where masuk_periode_spjt) as opd_spjt_hari_ini,
  (select count(*) from kendaraan where status = 'Aktif') as total_kendaraan_terdata,
  (select count(*) from v_kendaraan_status where lewat_jatuh_tempo) as kendaraan_lewat_jatuh_tempo,
  (select count(*) from v_kendaraan_status where status_kepatuhan = 'Sudah Bayar') as sudah_bayar_periode_berjalan,
  (select count(*) from v_kendaraan_status where plat = 'Non KT') as total_kendaraan_non_kt,
  (select coalesce(sum(total_pokok_pkb), 0) from v_tagihan_pkb) as potensi_tunggakan_pokok_pkb,
  (select count(*) from v_tagihan_pkb) as jumlah_kendaraan_menunggak,
  (select count(*) from kendaraan where status = 'Aktif' and plat = 'KT' and warna_plat is null) as kendaraan_belum_warna_plat;
