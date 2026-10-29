-- ============================================================================
-- SEED — jalankan sekali setelah 01-04 selesai
-- ============================================================================

-- Baris default pengaturan_template (single row, akan diedit dari menu Pengaturan)
insert into pengaturan_template (isi_surat, lampiran_teks, jabatan_pengirim)
values (
  'Berdasarkan basis data kendaraan bermotor yang telah kami inventarisasi, terdapat kendaraan bermotor atas nama instansi Saudara sebagaimana tercantum dalam lampiran surat ini yang akan segera memasuki masa jatuh tempo pembayaran Pajak Kendaraan Bermotor (PKB). Sehubungan dengan hal tersebut, kami mengimbau agar pembayaran PKB dapat dilakukan tepat waktu guna menghindari sanksi administratif sesuai ketentuan yang berlaku.',
  '2 (dua) lembar',
  'Kepala,'
);

-- Akun admin (1 akun) dibuat lewat Supabase Dashboard -> Authentication -> Add user,
-- BUKAN lewat SQL, supaya password di-hash oleh Supabase Auth dengan benar.
-- Setelah dibuat, akun tsb otomatis punya role `authenticated` dan bisa login di /login.
