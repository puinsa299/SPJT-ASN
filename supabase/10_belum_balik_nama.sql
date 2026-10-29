-- ============================================================================
-- 10_belum_balik_nama.sql — jalankan sekali
-- ============================================================================

alter table kendaraan add column if not exists belum_balik_nama boolean not null default false;
alter table kendaraan add column if not exists nama_pemilik_transaksi text; -- nama versi Samsat (dari file transaksi), utk dibandingkan

create index if not exists idx_kendaraan_belum_balik_nama on kendaraan (belum_balik_nama) where belum_balik_nama = true;

-- Breakdown "belum balik nama" per OPD, ditambahkan ke view yang sudah ada
-- (kolom baru WAJIB di akhir SELECT list; pakai subquery skalar supaya TIDAK
-- bikin cartesian product dengan join vs yang sudah ada)
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
  ) as persentase_kepatuhan,
  o.perlu_verifikasi,
  count(*) filter (where vs.plat = 'Non KT') as total_luar_daerah,
  (
    select count(*) from kendaraan k
    where k.opd_id = o.id and k.belum_balik_nama and k.status = 'Aktif'
  ) as total_belum_balik_nama
from opd o
left join v_kendaraan_status vs on vs.opd_id = o.id
group by o.id, o.nama_opd, o.kategori, o.perlu_verifikasi;
