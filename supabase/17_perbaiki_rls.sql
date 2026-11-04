-- Perbaikan: "new row violates row-level security policy for table njkb_ref".
-- Memberi akses penuh untuk pengguna yang sudah login (authenticated) pada tabel yang belum punya policy.
-- Aman dijalankan berulang.
do $$
declare t text;
begin
  foreach t in array array['njkb_ref','kendaraan','transaksi_pembayaran','opd','import_log','activity_log',
                           'riwayat_spjt','spjt_kendaraan','riwayat_status','parameter_pkb','tarif_swdkllj',
                           'map_kode_jenis','program_pemutihan','pemutihan_diskon_tier','pengaturan_surat']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table %I enable row level security', t);
      if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and cmd = 'ALL' and 'authenticated' = any(roles)) then
        execute format('create policy %I on %I for all to authenticated using (true) with check (true)', 'akses_login_' || t, t);
      end if;
      execute format('grant select, insert, update, delete on %I to authenticated', t);
    end if;
  end loop;
end $$;
