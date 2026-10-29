-- ============================================================================
-- 06_import_master_support.sql — jalankan setelah 01-05
-- ============================================================================

-- Tandai OPD yang otomatis dibuat lewat import (nama belum tentu sudah rapi/benar),
-- supaya gampang di-list & dicek manual di menu Data OPD.
alter table opd add column if not exists perlu_verifikasi boolean not null default false;

-- Tambah nilai enum baru khusus utk histori status yang dihasilkan dari Import Database Master
-- (kendaraan yang hilang dari data terbaru -> otomatis ditandai Non-aktif)
alter type sumber_perubahan_status add value if not exists 'Import Database Master';

-- Tambah breakdown kendaraan Luar Daerah (Non-KT) per OPD ke v_statistik_pembayaran_opd
-- (kolom baru WAJIB di akhir SELECT list)
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
  count(*) filter (where vs.plat = 'Non KT') as total_luar_daerah
from opd o
left join v_kendaraan_status vs on vs.opd_id = o.id
group by o.id, o.nama_opd, o.kategori, o.perlu_verifikasi;
