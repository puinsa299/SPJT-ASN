-- Judul lampiran surat bisa diubah dari menu Pengaturan. Kosong = pakai bawaan aplikasi.
alter table pengaturan_surat add column if not exists judul_lampiran text;
alter table pengaturan_surat add column if not exists subjudul_lampiran text;
