-- ============================================================================
-- 14_mesin_tagihan_v2.sql — jalankan sekali, setelah 01-13
-- ============================================================================
-- Isi:
--  A. Kolom data kendaraan baru (kode jenis, cc, kd_plat, no rangka)
--  B. Parameter baru + tabel tarif SWDKLLJ (PMK 16/PMK.010/2017) + pemetaan kode jenis
--  C. Fitur pemutihan (program + diskon bertingkat)
--  D. Pengaturan surat SPJT & STPD (terpisah)
--  E. Mesin hitung tagihan v2 (view dibuat ulang)
--
-- ASUMSI YANG PERLU DIKONFIRMASI (juga ditulis di panduan):
--  1. Masa pajak "mulai" = jatuh tempo periode dikurangi 1 tahun. Tarif denda
--     1%/24 bln berlaku bila masa pajak mulai >= 5 Jan 2025; di bawah itu
--     2%/15 bln + sanksi administrasi Rp50.000.
--  2. Kode jenis kendaraan: R roda 2; A/B/C mobil penumpang (sedan/jeep/minibus,
--     terbukti dari data Master); F pick-up; G/GL/GG truk;
--     D mikrobus (asumsi, 1 kendaraan), E bus, DD/EE bus-mikrobus.
--     Pemetaan ada di tabel map_kode_jenis, bisa diubah lewat SQL.
--  3. Angkutan umum = kd_plat 2 (kuning). Kode lain dianggap bukan umum.
--  4. Biaya kartu dana (Pasal 6, Rp3.000) dikenakan SEKALI per kendaraan per
--     tagihan (bukan per tahun) dan ditampilkan menyatu di kolom SWDKLLJ.
--     Bisa diganti ke "per tahun" di Pengaturan.
--  5. Denda SWDKLLJ: 25/50/75/100% dari SWDKLLJ untuk keterlambatan
--     1-90 / 91-180 / 181-270 / >270 hari, maksimal Rp100.000 per tahun.
--  6. Pemutihan: diskon pokok PKB juga menurunkan opsen (66% dari pokok setelah
--     diskon) dan denda yang tidak dihapus (dihitung dari pokok setelah diskon).
--  7. STNK/Plat: hanya periode yang menunggak, pada tahun ke-5, ke-10, dst
--     sejak tanggal awal STNK (tg_awal_stnk dari Database Master).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Kolom kendaraan
-- ---------------------------------------------------------------------------
alter table kendaraan add column if not exists kode_jenis text;   -- kd_jenis_kb (R, A, B, C, ...)
alter table kendaraan add column if not exists cc int;            -- jumlah_cc
alter table kendaraan add column if not exists kd_plat text;      -- 1 hitam, 2 kuning, 3 merah, 4 putih
alter table kendaraan add column if not exists no_rangka text;    -- no_chasis

-- ---------------------------------------------------------------------------
-- B. Parameter & tarif
-- ---------------------------------------------------------------------------
alter table parameter_pkb add column if not exists maks_tahun_swdkllj int not null default 5;
alter table parameter_pkb add column if not exists biaya_kartu_dana numeric(14,2) not null default 3000;
alter table parameter_pkb add column if not exists kartu_dana_per text not null default 'kendaraan';
alter table parameter_pkb add column if not exists swdkllj_denda_hari_per_tahap int not null default 90;
alter table parameter_pkb add column if not exists swdkllj_denda_tahap1 numeric(6,4) not null default 0.25;
alter table parameter_pkb add column if not exists swdkllj_denda_tahap2 numeric(6,4) not null default 0.50;
alter table parameter_pkb add column if not exists swdkllj_denda_tahap3 numeric(6,4) not null default 0.75;
alter table parameter_pkb add column if not exists swdkllj_denda_tahap4 numeric(6,4) not null default 1.00;
alter table parameter_pkb add column if not exists swdkllj_denda_maks_per_tahun numeric(14,2) not null default 100000;

create table if not exists tarif_swdkllj (
  kode text primary key,
  label text not null,
  nominal numeric(14,2) not null default 0,
  urut int not null default 0
);

insert into tarif_swdkllj (kode, label, nominal, urut) values
  ('BEBAS',               'Sepeda motor < 50 cc, ambulans, mobil jenazah, pemadam kebakaran', 0, 1),
  ('DEREK',               'Mobil derek dan sejenisnya', 20000, 2),
  ('RODA2_KECIL',         'Sepeda motor 50-250 cc dan kendaraan roda tiga', 32000, 3),
  ('RODA2_BESAR',         'Sepeda motor > 250 cc', 80000, 4),
  ('PENUMPANG_PRIBADI',   'Sedan, jeep, mobil penumpang bukan angkutan umum', 140000, 5),
  ('BARANG_RINGAN',       'Pick-up / mobil barang sampai 2.400 cc', 140000, 6),
  ('PENUMPANG_UMUM_KECIL','Mobil penumpang angkutan umum sampai 1.600 cc', 70000, 7),
  ('BUS_PRIBADI',         'Bus dan mikrobus bukan angkutan umum', 150000, 8),
  ('UMUM_BESAR',          'Bus/mikrobus angkutan umum dan mobil penumpang umum > 1.600 cc', 87000, 9),
  ('TRUK',                'Truk, mobil tangki, gandengan, mobil barang > 2.400 cc, kontainer', 160000, 10)
on conflict (kode) do nothing;

create table if not exists map_kode_jenis (
  kode text primary key,        -- isi kolom kendaraan.kode_jenis (huruf besar)
  kelompok text not null check (kelompok in ('RODA2','RODA3','PENUMPANG','BARANG','BUS','TRUK')),
  keterangan text
);

insert into map_kode_jenis (kode, kelompok, keterangan) values
  ('R',  'RODA2',     'Sepeda motor'),
  ('A',  'PENUMPANG', 'Sedan'),
  ('B',  'PENUMPANG', 'Jeep'),
  ('C',  'PENUMPANG', 'Minibus'),
  ('D',  'BUS',       'ASUMSI: mikrobus (bobot NJKB 1,085 sama dengan MIKROBUS) -- hanya 1 kendaraan di data'),
  ('F',  'BARANG',    'Pick-up'),
  ('E',  'BUS',       'Bus (bobot NJKB 1,1 = kategori BUS)'),
  ('G',  'TRUK',      'Truk'),
  ('GL', 'TRUK',      'Light truck'),
  ('GG', 'TRUK',      'Truk berat'),
  ('DD', 'BUS',       'Bus/mikrobus'),
  ('EE', 'BUS',       'Bus/mikrobus')
on conflict (kode) do nothing;

-- Golongan tarif SWDKLLJ untuk 1 kendaraan (Pasal 5 PMK 16/2017)
create or replace function fn_golongan_swdkllj(
  p_kode text, p_cc int, p_umum boolean, p_kategori text, p_jenis text
) returns text language plpgsql stable as $$
declare kel text;
begin
  select m.kelompok into kel from map_kode_jenis m where m.kode = upper(trim(coalesce(p_kode, '')));
  if kel is null then
    kel := case
      when p_kategori = 'RODA 2' then 'RODA2'
      when p_kategori in ('RODA 3', 'RODA 3 PENUMPANG', 'MOBIL RODA 3 PENUMPANG', 'MOBIL RODA 3 BARANG') then 'RODA3'
      when p_kategori in ('SEDAN', 'JEEP', 'MINIBUS') then 'PENUMPANG'
      when p_kategori in ('PICKUP', 'PICKUP BOX', 'BLINDVAN') then 'BARANG'
      when p_kategori in ('MIKROBUS', 'BUS') then 'BUS'
      when p_kategori in ('LTRUCK', 'TRUCK') then 'TRUK'
      when p_jenis ilike '%motor%' then 'RODA2'
      else 'PENUMPANG'
    end;
  end if;

  return case kel
    when 'RODA2' then case when p_cc is not null and p_cc < 50 then 'BEBAS'
                           when p_cc is null or p_cc <= 250 then 'RODA2_KECIL'
                           else 'RODA2_BESAR' end
    when 'RODA3' then 'RODA2_KECIL'
    when 'PENUMPANG' then case when p_umum then (case when coalesce(p_cc, 0) <= 1600 then 'PENUMPANG_UMUM_KECIL' else 'UMUM_BESAR' end)
                               else 'PENUMPANG_PRIBADI' end
    when 'BARANG' then case when coalesce(p_cc, 0) > 2400 then 'TRUK' else 'BARANG_RINGAN' end
    when 'BUS' then case when p_umum then 'UMUM_BESAR' else 'BUS_PRIBADI' end
    else 'TRUK'
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- C. Pemutihan
-- ---------------------------------------------------------------------------
create table if not exists program_pemutihan (
  id uuid primary key default uuid_generate_v4(),
  nama text not null,
  tanggal_mulai date not null,
  tanggal_selesai date not null,
  aktif boolean not null default true,
  hapus_denda_pkb boolean not null default true,
  hapus_denda_opsen boolean not null default true,
  hapus_denda_swdkllj boolean not null default true,
  hapus_sanksi_adm boolean not null default true,
  diskon_swdkllj_persen numeric(6,3) not null default 0,   -- 0 = tanpa diskon pokok SWDKLLJ
  catatan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tanggal_selesai >= tanggal_mulai)
);

create table if not exists pemutihan_diskon_tier (
  id uuid primary key default uuid_generate_v4(),
  program_id uuid not null references program_pemutihan(id) on delete cascade,
  min_tahun_tunggakan int not null check (min_tahun_tunggakan >= 1),
  diskon_persen numeric(6,3) not null check (diskon_persen >= 0 and diskon_persen <= 100),
  unique (program_id, min_tahun_tunggakan)
);

drop trigger if exists trg_program_pemutihan_updated_at on program_pemutihan;
create trigger trg_program_pemutihan_updated_at before update on program_pemutihan
  for each row execute function fn_set_updated_at();

-- program yang sedang berlaku hari ini (kalau ada beberapa, yang mulai paling akhir)
create or replace view v_pemutihan_aktif as
select * from program_pemutihan
where aktif and current_date between tanggal_mulai and tanggal_selesai
order by tanggal_mulai desc
limit 1;

-- ---------------------------------------------------------------------------
-- D. Pengaturan surat SPJT & STPD (terpisah). Kolom kosong = pakai nilai bawaan di aplikasi.
-- ---------------------------------------------------------------------------
create table if not exists pengaturan_surat (
  jenis text primary key check (jenis in ('SPJT', 'STPD')),
  kota text,
  sifat text,
  paragraf1 text,
  paragraf2 text,
  paragraf3 text,
  penutup text,
  jabatan text,
  nama_pejabat text,
  nip text,
  batas_hari int,
  lampiran_rincian boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into pengaturan_surat (jenis) values ('SPJT'), ('STPD') on conflict (jenis) do nothing;

-- ---------------------------------------------------------------------------
-- RLS + hak akses tabel baru (pola sama seperti 04_rls.sql)
-- ---------------------------------------------------------------------------
alter table tarif_swdkllj enable row level security;
alter table map_kode_jenis enable row level security;
alter table program_pemutihan enable row level security;
alter table pemutihan_diskon_tier enable row level security;
alter table pengaturan_surat enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tarif_swdkllj','map_kode_jenis','program_pemutihan','pemutihan_diskon_tier','pengaturan_surat'] loop
    if not exists (select 1 from pg_policies where tablename = t and policyname = 'admin_full_access_' || t) then
      execute format('create policy %I on %I for all to authenticated using (true) with check (true)', 'admin_full_access_' || t, t);
    end if;
  end loop;
end $$;

grant select, insert, update, delete on
  tarif_swdkllj, map_kode_jenis, program_pemutihan, pemutihan_diskon_tier, pengaturan_surat
to authenticated;
grant select on v_pemutihan_aktif to authenticated;

-- ---------------------------------------------------------------------------
-- E. Mesin hitung v2
-- ---------------------------------------------------------------------------
drop view if exists v_dashboard_cards;
drop view if exists v_tagihan_pkb;
drop view if exists v_tagihan_pkb_periode;
drop view if exists v_periode_tagihan;
drop view if exists v_pokok_pkb_kendaraan;

create view v_pokok_pkb_kendaraan as
select
  k.id as kendaraan_id,
  k.jenis, k.merk, k.model, k.tahun, k.kode_merk, k.tanggal_awal_stnk,
  k.warna_plat,
  (k.warna_plat is null) as pakai_tarif_default,
  k.kode_jenis, k.cc, k.kd_plat, k.no_rangka,
  (k.kd_plat = '2') as angkutan_umum,
  nm.njkb_ref_id,
  nm.kategori as njkb_kategori,
  nm.njkb,
  nm.bobot,
  nm.dp_pkb,
  nm.match_exact,
  (nm.dp_pkb is null) as pakai_fallback_bpkad,
  case
    when nm.dp_pkb is not null and nm.match_exact then 'NJKB'
    when nm.dp_pkb is not null then 'NJKB (kemiripan nama)'
    when vp.pokok_pkb is not null then 'Pembayaran terakhir'
    else 'Tidak ada dasar'
  end as sumber_dasar,
  case
    when nm.dp_pkb is not null then round(nm.dp_pkb * (
      case when k.warna_plat = 'Hitam' then (select tarif_pkb_hitam from parameter_pkb limit 1)
           else (select tarif_pkb_merah from parameter_pkb limit 1) end), 2)
    else coalesce(vp.pokok_pkb, 0)
  end as pokok_pkb_per_tahun,
  fn_golongan_swdkllj(k.kode_jenis, k.cc, coalesce(k.kd_plat = '2', false), nm.kategori, k.jenis) as golongan_swdkllj
from kendaraan k
left join v_njkb_match nm on nm.kendaraan_id = k.id
left join v_kendaraan_pembayaran_terakhir vp on vp.kendaraan_id = k.id
where k.status = 'Aktif' and k.plat = 'KT';

create view v_periode_tagihan as
with kend as (
  select k.id as kendaraan_id, k.jatuh_tempo
  from kendaraan k
  where k.status = 'Aktif' and k.plat = 'KT' and k.jatuh_tempo is not null
),
bayar_terakhir as (
  select kendaraan_id, max(tanggal_bayar_terakhir) as tanggal_bayar_terakhir
  from v_kendaraan_pembayaran_terakhir group by kendaraan_id
),
kandidat as (
  select kd.kendaraan_id, (kd.jatuh_tempo + (gs || ' years')::interval)::date as tanggal_jatuh_tempo_periode
  from kend kd cross join generate_series(0, 20) as gs
),
tersaring as (
  select kd.kendaraan_id, kd.tanggal_jatuh_tempo_periode,
    row_number() over (partition by kd.kendaraan_id order by kd.tanggal_jatuh_tempo_periode desc) as urutan_terbaru
  from kandidat kd
  left join bayar_terakhir bt on bt.kendaraan_id = kd.kendaraan_id
  where kd.tanggal_jatuh_tempo_periode <= current_date + interval '60 days'
    and (bt.tanggal_bayar_terakhir is null or kd.tanggal_jatuh_tempo_periode > bt.tanggal_bayar_terakhir)
)
select kendaraan_id, tanggal_jatuh_tempo_periode,
  (tanggal_jatuh_tempo_periode > current_date) as periode_baru_h60,
  urutan_terbaru
from tersaring
where urutan_terbaru <= (select greatest(maks_tahun_tunggakan, maks_tahun_swdkllj) from parameter_pkb limit 1);

create view v_tagihan_pkb_periode as
with pokok as materialized (select * from v_pokok_pkb_kendaraan),
param as materialized (select * from parameter_pkb limit 1),
prog as materialized (select * from v_pemutihan_aktif),
periode as (
  select pt.*,
    fn_bulan_telat(pt.tanggal_jatuh_tempo_periode) as bulan_telat,
    greatest(current_date - pt.tanggal_jatuh_tempo_periode, 0) as hari_telat,
    ((pt.tanggal_jatuh_tempo_periode - interval '1 year')::date >= (select tanggal_cutoff_denda from param)) as masa_pajak_baru
  from v_periode_tagihan pt
),
dasar as (
  select
    p.kendaraan_id, p.urutan_terbaru, p.tanggal_jatuh_tempo_periode, p.periode_baru_h60,
    p.bulan_telat, p.hari_telat, p.masa_pajak_baru,
    pk.pokok_pkb_per_tahun as pokok_n,
    round(pk.pokok_pkb_per_tahun * param.persentase_opsen, 2) as opsen_n,
    -- swdkllj hanya untuk maks_tahun_swdkllj periode terbaru
    case when p.urutan_terbaru <= param.maks_tahun_swdkllj
         then coalesce((select t.nominal from tarif_swdkllj t where t.kode = pk.golongan_swdkllj), 0) else 0 end as swdkllj_n,
    case when pk.golongan_swdkllj in ('BEBAS', 'RODA2_KECIL', 'RODA2_BESAR', 'DEREK') then 'RODA2' else 'RODA4' end as roda,
    (p.bulan_telat > 0
      and pk.tanggal_awal_stnk is not null
      and extract(year from p.tanggal_jatuh_tempo_periode)::int - extract(year from pk.tanggal_awal_stnk)::int > 0
      and mod(extract(year from p.tanggal_jatuh_tempo_periode)::int - extract(year from pk.tanggal_awal_stnk)::int, 5) = 0) as kena_stnk,
    -- jumlah tahun menunggak (periode yang sudah lewat jatuh tempo) per kendaraan
    count(*) filter (where p.bulan_telat > 0) over (partition by p.kendaraan_id) as tahun_menunggak
  from periode p
  join pokok pk on pk.kendaraan_id = p.kendaraan_id
  cross join param
),
hitung as (
  select d.*,
    case when d.masa_pajak_baru then param.tarif_denda_pkb_baru * least(d.bulan_telat, param.maks_bulan_denda_pkb_baru)
         else param.tarif_denda_pkb_lama * least(d.bulan_telat, param.maks_bulan_denda_pkb_lama) end as rate_denda_pkb,
    case when not d.masa_pajak_baru and d.bulan_telat > 0 then param.sanksi_keterlambatan_lama else 0 end as sanksi_n,
    param.tarif_denda_opsen * least(d.bulan_telat, param.maks_bulan_denda_opsen) as rate_denda_opsen,
    case when d.hari_telat <= 0 then 0
         else case least(ceil(d.hari_telat::numeric / param.swdkllj_denda_hari_per_tahap), 4)::int
                when 1 then param.swdkllj_denda_tahap1 when 2 then param.swdkllj_denda_tahap2
                when 3 then param.swdkllj_denda_tahap3 else param.swdkllj_denda_tahap4 end end as rate_denda_sw,
    case when d.kena_stnk then (case when d.roda = 'RODA2' then param.stnk_roda2 else param.stnk_roda4 end) else 0 end as stnk_n,
    case when d.kena_stnk then (case when d.roda = 'RODA2' then param.plat_roda2 else param.plat_roda4 end) else 0 end as plat_n,
    -- diskon bertingkat pemutihan (persen), 0 kalau tidak ada program / tidak menunggak
    coalesce((select t.diskon_persen from pemutihan_diskon_tier t, prog
              where t.program_id = prog.id and t.min_tahun_tunggakan <= d.tahun_menunggak
              order by t.min_tahun_tunggakan desc limit 1), 0) as diskon_pkb_persen
  from dasar d cross join param
)
select
  h.kendaraan_id, h.urutan_terbaru, h.tanggal_jatuh_tempo_periode, h.periode_baru_h60,
  h.bulan_telat, h.hari_telat, h.tahun_menunggak,
  -- ===== NORMAL =====
  h.pokok_n                                                       as pokok_pkb_per_tahun,
  h.opsen_n                                                       as opsen_periode,
  round(h.pokok_n * h.rate_denda_pkb, 2)                          as denda_pkb_periode,
  h.sanksi_n                                                      as sanksi_adm_periode,
  round(h.opsen_n * h.rate_denda_opsen, 2)                        as denda_opsen_periode,
  h.swdkllj_n                                                     as swdkllj_periode,
  least(round(h.swdkllj_n * h.rate_denda_sw, 2), param.swdkllj_denda_maks_per_tahun) as denda_swdkllj_periode,
  h.stnk_n                                                        as stnk_periode,
  h.plat_n                                                        as plat_periode,
  -- ===== SETELAH PEMUTIHAN (sama dengan normal bila tidak ada program aktif) =====
  round(h.pokok_n * (1 - h.diskon_pkb_persen / 100), 2)           as p_pokok_pkb,
  round(round(h.pokok_n * (1 - h.diskon_pkb_persen / 100), 2) * param.persentase_opsen, 2) as p_opsen,
  case when prog.hapus_denda_pkb then 0
       else round(round(h.pokok_n * (1 - h.diskon_pkb_persen / 100), 2) * h.rate_denda_pkb, 2) end as p_denda_pkb,
  case when prog.hapus_sanksi_adm then 0 else h.sanksi_n end      as p_sanksi_adm,
  case when prog.hapus_denda_opsen then 0
       else round(round(round(h.pokok_n * (1 - h.diskon_pkb_persen / 100), 2) * param.persentase_opsen, 2) * h.rate_denda_opsen, 2) end as p_denda_opsen,
  round(h.swdkllj_n * (1 - coalesce(prog.diskon_swdkllj_persen, 0) / 100), 2) as p_swdkllj,
  case when prog.hapus_denda_swdkllj then 0
       else least(round(round(h.swdkllj_n * (1 - coalesce(prog.diskon_swdkllj_persen, 0) / 100), 2) * h.rate_denda_sw, 2), param.swdkllj_denda_maks_per_tahun) end as p_denda_swdkllj,
  h.stnk_n as p_stnk,
  h.plat_n as p_plat,
  (prog.id is not null) as pemutihan_aktif
from hitung h
cross join param
left join prog on true;

-- Catatan: bila tidak ada program aktif, prog = NULL sehingga flag hapus_* NULL ->
-- "case when NULL" jatuh ke ELSE; diskon = 0. Karena itu nilai p_* identik dengan normal.

create view v_tagihan_pkb as
with agg as (
  select
    kendaraan_id,
    count(*) as jumlah_periode_tertagih,
    bool_or(periode_baru_h60) as ada_periode_baru_h60,
    max(tahun_menunggak) as tahun_menunggak,
    bool_or(pemutihan_aktif) as pemutihan_aktif,
    sum(pokok_pkb_per_tahun) as total_pokok_pkb, sum(denda_pkb_periode) as total_denda_pkb,
    sum(sanksi_adm_periode) as total_sanksi_adm, sum(opsen_periode) as total_opsen,
    sum(denda_opsen_periode) as total_denda_opsen, sum(swdkllj_periode) as total_swdkllj,
    sum(denda_swdkllj_periode) as total_denda_swdkllj, sum(stnk_periode) as total_stnk, sum(plat_periode) as total_plat,
    sum(p_pokok_pkb) as p_pokok_pkb, sum(p_denda_pkb) as p_denda_pkb, sum(p_sanksi_adm) as p_sanksi_adm,
    sum(p_opsen) as p_opsen, sum(p_denda_opsen) as p_denda_opsen, sum(p_swdkllj) as p_swdkllj,
    sum(p_denda_swdkllj) as p_denda_swdkllj, sum(p_stnk) as p_stnk, sum(p_plat) as p_plat,
    count(*) filter (where swdkllj_periode > 0) as periode_swdkllj
  from v_tagihan_pkb_periode
  group by kendaraan_id
),
kartu as (
  select a.*,
    case when a.periode_swdkllj = 0 then 0
         when (select kartu_dana_per from parameter_pkb limit 1) = 'tahun'
           then a.periode_swdkllj * (select biaya_kartu_dana from parameter_pkb limit 1)
         else (select biaya_kartu_dana from parameter_pkb limit 1) end as kartu_dana
  from agg a
)
select
  k.kendaraan_id, k.jumlah_periode_tertagih, k.ada_periode_baru_h60, k.tahun_menunggak, k.pemutihan_aktif,
  (select nama from v_pemutihan_aktif) as nama_pemutihan,
  pk.sumber_dasar, pk.golongan_swdkllj,
  -- NORMAL (kolom SWDKLLJ sudah termasuk biaya kartu dana)
  k.total_pokok_pkb, k.total_denda_pkb, k.total_sanksi_adm, k.total_opsen, k.total_denda_opsen,
  k.total_swdkllj + k.kartu_dana as total_swdkllj,
  k.total_denda_swdkllj, k.total_stnk, k.total_plat,
  k.total_pokok_pkb + k.total_denda_pkb + k.total_sanksi_adm + k.total_opsen + k.total_denda_opsen
    + k.total_swdkllj + k.kartu_dana + k.total_denda_swdkllj + k.total_stnk + k.total_plat as total_tagihan_normal,
  -- SETELAH PEMUTIHAN
  k.p_pokok_pkb, k.p_denda_pkb, k.p_sanksi_adm, k.p_opsen, k.p_denda_opsen,
  k.p_swdkllj + k.kartu_dana as p_swdkllj,
  k.p_denda_swdkllj, k.p_stnk, k.p_plat,
  k.p_pokok_pkb + k.p_denda_pkb + k.p_sanksi_adm + k.p_opsen + k.p_denda_opsen
    + k.p_swdkllj + k.kartu_dana + k.p_denda_swdkllj + k.p_stnk + k.p_plat as total_tagihan_setelah_pemutihan,
  (k.total_pokok_pkb + k.total_denda_pkb + k.total_sanksi_adm + k.total_opsen + k.total_denda_opsen
    + k.total_swdkllj + k.kartu_dana + k.total_denda_swdkllj + k.total_stnk + k.total_plat)
  - (k.p_pokok_pkb + k.p_denda_pkb + k.p_sanksi_adm + k.p_opsen + k.p_denda_opsen
    + k.p_swdkllj + k.kartu_dana + k.p_denda_swdkllj + k.p_stnk + k.p_plat) as total_potongan_pemutihan,
  -- total yang berlaku saat ini (otomatis ikut program aktif)
  case when k.pemutihan_aktif
       then k.p_pokok_pkb + k.p_denda_pkb + k.p_sanksi_adm + k.p_opsen + k.p_denda_opsen + k.p_swdkllj + k.kartu_dana + k.p_denda_swdkllj + k.p_stnk + k.p_plat
       else k.total_pokok_pkb + k.total_denda_pkb + k.total_sanksi_adm + k.total_opsen + k.total_denda_opsen + k.total_swdkllj + k.kartu_dana + k.total_denda_swdkllj + k.total_stnk + k.total_plat
  end as total_tagihan
from kartu k
left join v_pokok_pkb_kendaraan pk on pk.kendaraan_id = k.kendaraan_id;

create view v_dashboard_cards as
select
  (select count(distinct opd_id) from v_kendaraan_status where masuk_periode_spjt) as opd_spjt_hari_ini,
  (select count(*) from kendaraan where status = 'Aktif') as total_kendaraan_terdata,
  (select count(*) from v_kendaraan_status where lewat_jatuh_tempo) as kendaraan_lewat_jatuh_tempo,
  (select count(*) from v_kendaraan_status where status_kepatuhan = 'Sudah Bayar') as sudah_bayar_periode_berjalan,
  (select count(*) from v_kendaraan_status where plat = 'Non KT') as total_kendaraan_non_kt,
  (select coalesce(sum(total_pokok_pkb), 0) from v_tagihan_pkb) as potensi_tunggakan_pokok_pkb,
  (select count(*) from v_tagihan_pkb) as jumlah_kendaraan_menunggak,
  (select count(*) from kendaraan where status = 'Aktif' and plat = 'KT' and warna_plat is null) as kendaraan_belum_warna_plat,
  (select coalesce(sum(total_tagihan_normal), 0) from v_tagihan_pkb) as potensi_total_tagihan,
  (select coalesce(sum(total_tagihan), 0) from v_tagihan_pkb) as total_tagihan_berlaku,
  (select count(*) from kendaraan where status = 'Aktif' and plat = 'KT' and (kode_jenis is null or cc is null)) as kendaraan_belum_kode_jenis;

grant select on v_pokok_pkb_kendaraan, v_periode_tagihan, v_tagihan_pkb_periode, v_tagihan_pkb to authenticated;
grant select on v_dashboard_cards to anon, authenticated;
