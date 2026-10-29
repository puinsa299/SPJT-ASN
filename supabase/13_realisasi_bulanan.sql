-- ============================================================================
-- 13_realisasi_bulanan.sql
-- Perbaikan menu Statistik: "Realisasi aktual pembayaran per bulan"
--
-- Masalah: v_realisasi_spjt hanya menghitung transaksi kendaraan yang SUDAH
-- pernah masuk riwayat SPJT. Akibatnya hasil upload transaksi/realisasi tidak
-- muncul di Statistik sebelum SPJT diterbitkan.
--
-- Perbaikan: view baru berikut menghitung SEMUA transaksi_pembayaran per bulan
-- bayar (otomatis ikut setiap kali upload transaksi), dan memisahkan porsi yang
-- dibayar setelah SPJT terbit. v_realisasi_spjt tidak diubah (dipakai export).
-- Aman dijalankan berulang.
-- ============================================================================

create or replace view v_realisasi_bulanan as
select
  date_trunc('month', tp.tanggal_bayar)::date as bulan_realisasi,
  count(*)                                    as jumlah_transaksi,
  count(distinct tp.kendaraan_id)             as jumlah_kendaraan,
  coalesce(sum(tp.total), 0)                  as nominal,
  coalesce(sum(case when exists (
      select 1
      from spjt_kendaraan sk
      join riwayat_spjt rs on rs.id = sk.riwayat_spjt_id
      where sk.kendaraan_id = tp.kendaraan_id
        and tp.tanggal_bayar >= rs.tanggal_terbit
    ) then tp.total else 0 end), 0)           as nominal_setelah_spjt
from transaksi_pembayaran tp
group by 1;

grant select on v_realisasi_bulanan to authenticated;
