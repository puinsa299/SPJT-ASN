-- Kartu dana Rp3.000 dikenakan TIAP TAHUN tagihan (jadi SWDKLLJ motor 50-250 cc = Rp35.000 per tahun).
-- Sama dengan mengubah "Kartu dana dikenakan" di Pengaturan menjadi "per tahun tagihan". Aman dijalankan berulang.
alter table parameter_pkb alter column kartu_dana_per set default 'tahun';
update parameter_pkb set kartu_dana_per = 'tahun';
