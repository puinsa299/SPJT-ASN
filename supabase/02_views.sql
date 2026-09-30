-- ============================================================================
-- VIEWS — status kepatuhan, statistik, dashboard
-- ============================================================================
-- CATATAN ASUMSI PENTING (mohon divalidasi):
-- Karena siklus PKB berulang tahunan pada tanggal yang sama (misal tiap 16 Okt),
-- "jatuh_tempo tahun berjalan" dihitung dengan memetakan bulan/tanggal di kolom
-- kendaraan.jatuh_tempo ke tahun saat ini (current_date). Field kendaraan.jatuh_tempo
-- sendiri disimpan sebagai tanggal jatuh tempo AKTIF (bisa di masa lalu kalau nunggak,
-- atau tahun depan kalau baru saja diperpanjang). Kalau logika penyimpanan jatuh_tempo
-- di sistem sumber data (Samsat) berbeda, view ini perlu disesuaikan.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_kendaraan_pembayaran_terakhir : transaksi terakhir per kendaraan
-- ----------------------------------------------------------------------------
create or replace view v_kendaraan_pembayaran_terakhir as
select distinct on (kendaraan_id)
  kendaraan_id,
  tanggal_bayar as tanggal_bayar_terakhir,
  masa_pajak_periode,
  pokok_pkb,
  opsen,
  swdkllj,
  total
from transaksi_pembayaran
order by kendaraan_id, tanggal_bayar desc;

-- ----------------------------------------------------------------------------
-- v_kendaraan_status : status kepatuhan per kendaraan (dihitung live, bukan kolom statis)
-- ----------------------------------------------------------------------------
create or replace view v_kendaraan_status as
with siklus as (
  select
    k.id as kendaraan_id,
    k.opd_id,
    k.plat,
    k.status as status_kepemilikan,
    k.jatuh_tempo,
    case when k.jatuh_tempo is not null then
      make_date(extract(year from current_date)::int, extract(month from k.jatuh_tempo)::int, extract(day from k.jatuh_tempo)::int)
    end as jatuh_tempo_siklus_ini,
    p.tanggal_bayar_terakhir,
    p.total as total_bayar_terakhir
  from kendaraan k
  left join v_kendaraan_pembayaran_terakhir p on p.kendaraan_id = k.id
  where k.status = 'Aktif'   -- non-aktif/dijual/mutasi keluar tidak dihitung status kepatuhan
)
select
  kendaraan_id,
  opd_id,
  plat,
  jatuh_tempo,
  jatuh_tempo_siklus_ini,
  tanggal_bayar_terakhir,
  case
    when plat = 'Non KT' then 'Luar Daerah'
    when tanggal_bayar_terakhir is not null
         and tanggal_bayar_terakhir >= (jatuh_tempo_siklus_ini - interval '1 year')
         and tanggal_bayar_terakhir <= jatuh_tempo_siklus_ini
      then 'Sudah Bayar'
    when jatuh_tempo_siklus_ini >= current_date then 'Masih Aktif'
    else 'Belum Bayar'
  end as status_kepatuhan,
  -- flag global: lewat jatuh tempo APAPUN tahunnya (termasuk tunggakan lama)
  (jatuh_tempo is not null and jatuh_tempo < current_date
     and (tanggal_bayar_terakhir is null or tanggal_bayar_terakhir < jatuh_tempo)) as lewat_jatuh_tempo,
  -- flag masuk periode SPJT: H-60 dari jatuh tempo, khusus plat KT
  (plat = 'KT' and jatuh_tempo is not null
     and jatuh_tempo between current_date and current_date + interval '60 days') as masuk_periode_spjt
from siklus;

-- ----------------------------------------------------------------------------
-- v_dashboard_cards : angka-angka kartu ringkasan dashboard
-- ----------------------------------------------------------------------------
create or replace view v_dashboard_cards as
select
  (select count(distinct opd_id) from v_kendaraan_status where masuk_periode_spjt) as opd_spjt_hari_ini,
  (select count(*) from kendaraan where status = 'Aktif') as total_kendaraan_terdata,
  (select count(*) from v_kendaraan_status where lewat_jatuh_tempo) as kendaraan_lewat_jatuh_tempo,
  (select count(*) from v_kendaraan_status where status_kepatuhan = 'Sudah Bayar') as sudah_bayar_periode_berjalan,
  (select count(*) from v_kendaraan_status where plat = 'Non KT') as total_kendaraan_non_kt;

-- ----------------------------------------------------------------------------
-- v_statistik_pembayaran_opd : rekap per OPD, hanya basis kendaraan plat KT
-- ----------------------------------------------------------------------------
create or replace view v_statistik_pembayaran_opd as
select
  o.id as opd_id,
  o.nama_opd,
  o.kategori,
  count(*) filter (where vs.plat = 'KT') as total_kendaraan_kt,
  count(*) filter (where vs.status_kepatuhan = 'Sudah Bayar') as sudah_bayar,
  count(*) filter (where vs.status_kepatuhan = 'Masih Aktif') as masih_aktif,
  count(*) filter (where vs.status_kepatuhan = 'Belum Bayar') as belum_bayar,
  round(
    100.0 * count(*) filter (where vs.status_kepatuhan = 'Sudah Bayar')
    / nullif(count(*) filter (where vs.plat = 'KT'), 0), 2
  ) as persentase_kepatuhan
from opd o
left join v_kendaraan_status vs on vs.opd_id = o.id and vs.plat = 'KT'
group by o.id, o.nama_opd, o.kategori;

-- ----------------------------------------------------------------------------
-- v_efektivitas_spjt : kendaraan yang pernah diberi SPJT, sudah/belum bayar setelahnya
-- ----------------------------------------------------------------------------
create or replace view v_efektivitas_spjt as
with pernah_spjt as (
  select distinct sk.kendaraan_id, max(rs.tanggal_terbit) as tanggal_spjt_terakhir
  from spjt_kendaraan sk
  join riwayat_spjt rs on rs.id = sk.riwayat_spjt_id
  group by sk.kendaraan_id
),
bayar_setelah_spjt as (
  select ps.kendaraan_id, ps.tanggal_spjt_terakhir,
         max(tp.tanggal_bayar) as tanggal_bayar_setelah_spjt
  from pernah_spjt ps
  left join transaksi_pembayaran tp
    on tp.kendaraan_id = ps.kendaraan_id
    and tp.tanggal_bayar >= ps.tanggal_spjt_terakhir
  group by ps.kendaraan_id, ps.tanggal_spjt_terakhir
)
select
  kendaraan_id,
  tanggal_spjt_terakhir,
  tanggal_bayar_setelah_spjt,
  (tanggal_bayar_setelah_spjt is not null) as sudah_bayar_setelah_spjt,
  case when tanggal_bayar_setelah_spjt is null then
    -- bucket keterlambatan sejak SPJT terbit, utk kendaraan yg masih belum bayar
    case
      when current_date - tanggal_spjt_terakhir < 30 then '<1 bulan'
      when current_date - tanggal_spjt_terakhir between 30 and 90 then '1-3 bulan'
      else '>3 bulan'
    end
  end as bucket_belum_bayar
from bayar_setelah_spjt;

-- ----------------------------------------------------------------------------
-- v_realisasi_spjt : detail realisasi (utk menu realisasi & export), per kendaraan+bulan bayar
-- ----------------------------------------------------------------------------
create or replace view v_realisasi_spjt as
select
  o.nama_opd,
  k.id as kendaraan_id,
  k.nomor_polisi_display,
  rs.tanggal_terbit as tanggal_spjt,
  tp.tanggal_bayar,
  date_trunc('month', tp.tanggal_bayar)::date as bulan_realisasi,
  tp.total as nominal
from spjt_kendaraan sk
join riwayat_spjt rs on rs.id = sk.riwayat_spjt_id
join kendaraan k on k.id = sk.kendaraan_id
join opd o on o.id = rs.opd_id
join transaksi_pembayaran tp
  on tp.kendaraan_id = k.id
  and tp.tanggal_bayar >= rs.tanggal_terbit;

-- ----------------------------------------------------------------------------
-- v_opd_perlu_spjt : OPD dengan kendaraan masuk periode SPJT (utk list bawah dashboard)
-- ----------------------------------------------------------------------------
create or replace view v_opd_perlu_spjt as
select
  o.id as opd_id,
  o.nama_opd,
  count(*) as jumlah_kendaraan_perlu_spjt
from opd o
join v_kendaraan_status vs on vs.opd_id = o.id and vs.masuk_periode_spjt
group by o.id, o.nama_opd
order by jumlah_kendaraan_perlu_spjt desc;

-- ----------------------------------------------------------------------------
-- v_spjt_hari_ini : kendaraan jatuh tempo hari ini (menu 4)
-- ----------------------------------------------------------------------------
create or replace view v_spjt_hari_ini as
select
  k.id as kendaraan_id,
  k.nomor_polisi_display,
  k.nama_pemilik,
  o.nama_opd,
  k.merk,
  k.model,
  k.tahun,
  k.jatuh_tempo,
  (k.jatuh_tempo - current_date) as sisa_hari,
  (
    select count(*) from v_kendaraan_status vs2
    where vs2.opd_id = k.opd_id and vs2.status_kepatuhan = 'Belum Bayar'
  ) as jumlah_tunggakan_instansi
from kendaraan k
join opd o on o.id = k.opd_id
where k.jatuh_tempo = current_date and k.status = 'Aktif' and k.plat = 'KT';

-- ----------------------------------------------------------------------------
-- v_rekap_pajak_jenis : rekap pajak per jenis kendaraan (utk detail OPD)
-- ----------------------------------------------------------------------------
create or replace view v_rekap_pajak_jenis as
select
  k.opd_id,
  k.jenis,
  count(*) as jumlah_kendaraan,
  sum(p.total) as total_nilai_pkb
from kendaraan k
left join v_kendaraan_pembayaran_terakhir p on p.kendaraan_id = k.id
where k.status = 'Aktif'
group by k.opd_id, k.jenis;

-- ----------------------------------------------------------------------------
-- v_profiling_opd : OPD diurutkan potensi (kendaraan/nilai pkb) + kepatuhan
-- ----------------------------------------------------------------------------
create or replace view v_profiling_opd as
select
  sp.opd_id,
  sp.nama_opd,
  sp.kategori,
  sp.total_kendaraan_kt,
  sp.persentase_kepatuhan,
  coalesce(sum(p.total), 0) as potensi_nilai_pkb
from v_statistik_pembayaran_opd sp
left join kendaraan k on k.opd_id = sp.opd_id and k.status = 'Aktif' and k.plat = 'KT'
left join v_kendaraan_pembayaran_terakhir p on p.kendaraan_id = k.id
group by sp.opd_id, sp.nama_opd, sp.kategori, sp.total_kendaraan_kt, sp.persentase_kepatuhan
order by potensi_nilai_pkb desc;
