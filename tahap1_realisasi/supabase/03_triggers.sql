-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Generic: auto-update kolom updated_at
-- ----------------------------------------------------------------------------
create or replace function fn_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_opd_updated_at before update on opd
  for each row execute function fn_set_updated_at();

create trigger trg_kendaraan_updated_at before update on kendaraan
  for each row execute function fn_set_updated_at();

create trigger trg_riwayat_spjt_updated_at before update on riwayat_spjt
  for each row execute function fn_set_updated_at();

create trigger trg_pengaturan_template_updated_at before update on pengaturan_template
  for each row execute function fn_set_updated_at();

-- ----------------------------------------------------------------------------
-- Auto-hitung opsen (66% x pokok_pkb) & total, bila tidak diisi eksplisit dari import
-- ----------------------------------------------------------------------------
create or replace function fn_calc_opsen_total()
returns trigger as $$
begin
  if new.opsen is null and new.pokok_pkb is not null then
    new.opsen := round(new.pokok_pkb * 0.66, 2);
  end if;

  if new.total is null then
    new.total := coalesce(new.pokok_pkb, 0) + coalesce(new.opsen, 0) + coalesce(new.swdkllj, 0);
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_transaksi_calc_opsen
  before insert or update on transaksi_pembayaran
  for each row execute function fn_calc_opsen_total();

-- ----------------------------------------------------------------------------
-- Terapkan efek perubahan status ke tabel kendaraan setiap kali riwayat_status ditambahkan.
-- Ini SATU-SATUNYA jalur resmi untuk mengubah status kendaraan — app cukup INSERT ke
-- riwayat_status, trigger ini yang menerapkan efeknya ke kendaraan (termasuk mutasi OPD).
-- ----------------------------------------------------------------------------
create or replace function fn_apply_riwayat_status()
returns trigger as $$
begin
  if new.status_baru = 'Mutasi' and new.opd_tujuan_id is not null then
    -- Mutasi pindah OPD (internal): kendaraan tetap aktif, pindah opd_id ke tujuan
    update kendaraan
    set opd_id = new.opd_tujuan_id,
        status = 'Aktif',
        keterangan_status = coalesce(new.keterangan, 'Mutasi dari OPD asal')
    where id = new.kendaraan_id;
  else
    -- Semua status lain (Dijual, Mutasi keluar, Ganti Nopol, Non-aktif, kembali Aktif)
    update kendaraan
    set status = new.status_baru,
        keterangan_status = new.keterangan
    where id = new.kendaraan_id;
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_riwayat_status_apply
  after insert on riwayat_status
  for each row execute function fn_apply_riwayat_status();

-- ----------------------------------------------------------------------------
-- Auto-isi opd_asal_id di riwayat_status (snapshot opd sebelum perubahan), bila kosong
-- ----------------------------------------------------------------------------
create or replace function fn_default_opd_asal()
returns trigger as $$
begin
  if new.opd_asal_id is null then
    select opd_id into new.opd_asal_id from kendaraan where id = new.kendaraan_id;
  end if;
  if new.status_lama is null then
    select status into new.status_lama from kendaraan where id = new.kendaraan_id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_riwayat_status_default_opd
  before insert on riwayat_status
  for each row execute function fn_default_opd_asal();
