-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Prinsip akses:
--   - anon (belum login)  : hanya boleh SELECT dari VIEW agregat dashboard
--                            (tidak ada akses ke tabel dasar / data per-kendaraan)
--   - authenticated (admin, 1 akun) : akses penuh ke semua tabel & view
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Aktifkan RLS di semua tabel dasar & kunci default (tidak ada policy = tidak ada akses)
-- ----------------------------------------------------------------------------
alter table opd enable row level security;
alter table kendaraan enable row level security;
alter table transaksi_pembayaran enable row level security;
alter table riwayat_status enable row level security;
alter table riwayat_spjt enable row level security;
alter table spjt_kendaraan enable row level security;
alter table pengaturan_template enable row level security;
alter table import_log enable row level security;
alter table activity_log enable row level security;

-- ----------------------------------------------------------------------------
-- 2. Policy: admin (authenticated) akses penuh ke semua tabel
-- ----------------------------------------------------------------------------
create policy admin_full_access_opd on opd
  for all to authenticated using (true) with check (true);

create policy admin_full_access_kendaraan on kendaraan
  for all to authenticated using (true) with check (true);

create policy admin_full_access_transaksi on transaksi_pembayaran
  for all to authenticated using (true) with check (true);

create policy admin_full_access_riwayat_status on riwayat_status
  for all to authenticated using (true) with check (true);

create policy admin_full_access_riwayat_spjt on riwayat_spjt
  for all to authenticated using (true) with check (true);

create policy admin_full_access_spjt_kendaraan on spjt_kendaraan
  for all to authenticated using (true) with check (true);

create policy admin_full_access_pengaturan on pengaturan_template
  for all to authenticated using (true) with check (true);

create policy admin_full_access_import_log on import_log
  for all to authenticated using (true) with check (true);

create policy admin_full_access_activity_log on activity_log
  for all to authenticated using (true) with check (true);

-- anon: TIDAK ada policy dibuat untuk tabel-tabel di atas -> otomatis tidak bisa akses sama sekali.

-- ----------------------------------------------------------------------------
-- 3. Dashboard publik: expose HANYA lewat view agregat, bukan tabel dasar.
--    View di Postgres/Supabase secara default berjalan dengan hak akses PEMILIK view
--    (security_invoker = false), sehingga anon bisa SELECT dari view ini walau tidak
--    punya akses langsung ke tabel dasarnya — asal view tsb tidak mengekspos kolom
--    sensitif per-kendaraan (nopol, nama pemilik, dsb).
-- ----------------------------------------------------------------------------

-- Pastikan view-view berikut TIDAK berjalan sebagai security_invoker (pakai hak owner)
alter view v_dashboard_cards set (security_invoker = false);
alter view v_statistik_pembayaran_opd set (security_invoker = false);
alter view v_opd_perlu_spjt set (security_invoker = false);

-- Grant akses schema & select hanya ke view-view dashboard yang memang untuk publik
grant usage on schema public to anon;
grant select on v_dashboard_cards to anon;
grant select on v_statistik_pembayaran_opd to anon;   -- agregat per OPD (jumlah, %), tanpa detail kendaraan
grant select on v_opd_perlu_spjt to anon;             -- nama OPD + jumlah kendaraan, tanpa detail nopol

-- View/tabel lain (v_kendaraan_status, v_efektivitas_spjt, v_spjt_hari_ini, v_rekap_pajak_jenis,
-- v_profiling_opd, v_realisasi_spjt, dst) TIDAK di-grant ke anon karena berisi data per-kendaraan
-- atau butuh login admin sesuai keputusan akses (dashboard publik hanya kartu ringkasan & statistik OPD).

-- ----------------------------------------------------------------------------
-- 4. authenticated: grant akses penuh ke semua view turunan
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select on
  v_kendaraan_pembayaran_terakhir,
  v_kendaraan_status,
  v_dashboard_cards,
  v_statistik_pembayaran_opd,
  v_efektivitas_spjt,
  v_realisasi_spjt,
  v_opd_perlu_spjt,
  v_spjt_hari_ini,
  v_rekap_pajak_jenis,
  v_profiling_opd
to authenticated;

grant select, insert, update, delete on
  opd, kendaraan, transaksi_pembayaran, riwayat_status, riwayat_spjt,
  spjt_kendaraan, pengaturan_template, import_log, activity_log
to authenticated;
