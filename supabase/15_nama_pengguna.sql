-- ============================================================================
-- 15_nama_pengguna.sql
-- Kolom lama "nama_pemilik" ternyata berisi nama PENGGUNA kendaraan (ASN pemakai).
--   nama_pengguna : nama ASN pengguna kendaraan (dari kolom "Nama Pengguna" file master)
--   nama_pemilik  : nama pemilik di STNK/Samsat (dari kolom "Column2" file master atau nm_pemilik transaksi)
-- Migrasi hanya berjalan SEKALI (aman bila file ini dijalankan ulang).
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'kendaraan' and column_name = 'nama_pengguna'
  ) then
    alter table kendaraan add column nama_pengguna text;
    update kendaraan set nama_pengguna = nama_pemilik;                 -- isi lama = nama pengguna
    update kendaraan set nama_pemilik = nama_pemilik_transaksi;        -- pemilik: terisi dari data Samsat bila ada, sisanya kosong sampai import master
  end if;
end $$;

create index if not exists idx_kendaraan_pengguna_trgm on kendaraan using gin (nama_pengguna gin_trgm_ops);

-- view "SPJT hari ini" memuat nama pengguna & nama pemilik
drop view if exists v_spjt_hari_ini;
create view v_spjt_hari_ini as
select
  k.id as kendaraan_id,
  k.nomor_polisi_display,
  k.nama_pengguna,
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

grant select on v_spjt_hari_ini to anon, authenticated;
