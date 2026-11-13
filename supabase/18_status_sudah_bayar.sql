-- Aturan "Sudah Bayar":
--   Sudah Bayar = nopol ada di transaksi (pernah tercatat pembayaran) DAN jatuh tempo (akhir PKB) belum lewat.
--   Kendaraan yang jatuh temponya sudah lewat tidak mungkin "Sudah Bayar".
--   Tanpa catatan transaksi, kendaraan tidak pernah berstatus "Sudah Bayar".
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
  where k.status = 'Aktif'
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
    when tanggal_bayar_terakhir is not null and jatuh_tempo is not null and jatuh_tempo >= current_date
      then 'Sudah Bayar'
    when jatuh_tempo is not null and jatuh_tempo >= current_date then 'Masih Aktif'
    else 'Belum Bayar'
  end as status_kepatuhan,
  (jatuh_tempo is not null and jatuh_tempo < current_date
     and (tanggal_bayar_terakhir is null or tanggal_bayar_terakhir < jatuh_tempo)) as lewat_jatuh_tempo,
  (plat = 'KT' and jatuh_tempo is not null
     and jatuh_tempo between current_date and current_date + interval '60 days') as masuk_periode_spjt
from siklus;
grant select on v_kendaraan_status to authenticated;
