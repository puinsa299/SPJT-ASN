-- Dashboard menampilkan "-" dan Rp 0 karena query kartu ringkasan terlalu lama (melewati batas waktu Supabase)
-- setelah data kendaraan bertambah. Perhitungan tagihan sekarang dilakukan SEKALI, bukan 5 kali.
-- Kolom hasil sama persis dengan sebelumnya. Aman dijalankan berulang.
create or replace view v_dashboard_cards as
with t as materialized (
  select
    count(*) as jumlah,
    coalesce(sum(total_pokok_pkb), 0) as pokok,
    coalesce(sum(total_tagihan_normal), 0) as normal,
    coalesce(sum(total_tagihan), 0) as berlaku
  from v_tagihan_pkb
),
s as materialized (
  select
    count(distinct opd_id) filter (where masuk_periode_spjt) as opd_spjt,
    count(*) filter (where lewat_jatuh_tempo) as lewat,
    count(*) filter (where status_kepatuhan = 'Sudah Bayar') as sudah,
    count(*) filter (where plat = 'Non KT') as non_kt
  from v_kendaraan_status
),
k as materialized (
  select
    count(*) as total,
    count(*) filter (where plat = 'KT' and warna_plat is null) as tanpa_warna,
    count(*) filter (where plat = 'KT' and (kode_jenis is null or cc is null)) as tanpa_jenis
  from kendaraan where status = 'Aktif'
)
select
  s.opd_spjt as opd_spjt_hari_ini,
  k.total as total_kendaraan_terdata,
  s.lewat as kendaraan_lewat_jatuh_tempo,
  s.sudah as sudah_bayar_periode_berjalan,
  s.non_kt as total_kendaraan_non_kt,
  t.pokok as potensi_tunggakan_pokok_pkb,
  t.jumlah as jumlah_kendaraan_menunggak,
  k.tanpa_warna as kendaraan_belum_warna_plat,
  t.normal as potensi_total_tagihan,
  t.berlaku as total_tagihan_berlaku,
  k.tanpa_jenis as kendaraan_belum_kode_jenis
from t, s, k;
grant select on v_dashboard_cards to anon, authenticated;

-- Batas waktu query bawaan Supabase hanya 3 detik (anon) dan 8 detik (authenticated). Perhitungan tagihan
-- ribuan kendaraan butuh beberapa detik, jadi batasnya dinaikkan agar dashboard tidak kosong.
alter role anon set statement_timeout = '30s';
alter role authenticated set statement_timeout = '30s';
notify pgrst, 'reload config';
