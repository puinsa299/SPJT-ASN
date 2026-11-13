-- ============================================================================
-- 22 — Import Hasil Cek SPJT/STPD
--   * transaksi_pembayaran.sumber : penanda realisasi yang berasal dari fitur Import
--     Hasil Cek (kosong = transaksi asli dari Import Transaksi Bulanan).
--   * jenis_import 'Hasil Cek' untuk pencatatan di log import.
-- Aman dijalankan berulang.
-- ============================================================================
alter table transaksi_pembayaran add column if not exists sumber text;
create index if not exists idx_transaksi_sumber on transaksi_pembayaran (sumber) where sumber is not null;

alter type jenis_import add value if not exists 'Hasil Cek';

-- ============================================================================
-- Riwayat surat: bedakan SPJT dan STPD, dan tampilkan tanggal surat terakhir per kendaraan
-- ============================================================================
alter table riwayat_spjt add column if not exists jenis text not null default 'SPJT';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'riwayat_spjt_jenis_check') then
    alter table riwayat_spjt add constraint riwayat_spjt_jenis_check check (jenis in ('SPJT', 'STPD'));
  end if;
end $$;

create or replace view v_kendaraan_surat_terakhir as
select
  sk.kendaraan_id,
  max(rs.tanggal_terbit) filter (where rs.jenis = 'SPJT') as tanggal_spjt_terakhir,
  max(rs.tanggal_terbit) filter (where rs.jenis = 'STPD') as tanggal_stpd_terakhir
from spjt_kendaraan sk
join riwayat_spjt rs on rs.id = sk.riwayat_spjt_id
group by sk.kendaraan_id;

grant select on v_kendaraan_surat_terakhir to authenticated;
