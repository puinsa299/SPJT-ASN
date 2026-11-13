-- ============================================================================
-- 21 — Pencocokan NJKB untuk kendaraan dengan jenis umum ("Roda 4") tanpa kode merk
--
-- Masalah: master hanya berisi jenis "Roda 4" / "Roda 2" dan kode_merk kosong.
-- Pencocokan lewat nama dulu mewajibkan kategori NJKB (SEDAN/MINIBUS/JEEP/...)
-- yang tidak bisa ditebak dari "Roda 4", sehingga pokok PKB menjadi Rp 0.
--
-- Perbaikan: kalau jenis tidak bisa dipetakan ke kategori NJKB, pencocokan
-- memakai merk + model + tahun saja (kategori diambil dari baris NJKB yang cocok).
-- "Roda 4" hanya boleh cocok ke kategori roda 4; "Roda 2" ke kategori roda 2.
-- ============================================================================
create or replace function fn_match_njkb(
  p_kode_merk text, p_tahun int, p_jenis text, p_merk text, p_model text
)
returns table(njkb_ref_id uuid, kategori text, njkb numeric, bobot numeric, dp_pkb numeric, match_exact boolean)
language plpgsql stable as $$
declare
  v_kat text := fn_jenis_to_kategori_njkb(p_jenis);
  v_grup text := case
    when p_jenis ilike '%roda%4%' or p_jenis ilike '%roda%empat%' or p_jenis ilike '%mobil%' then 'R4'
    when p_jenis ilike '%roda%2%' or p_jenis ilike '%roda%dua%' or p_jenis ilike '%motor%' then 'R2'
    else null end;
  v_merk text := fn_normalize_text(p_merk);
  v_model text := fn_normalize_text(p_model);
begin
  if p_kode_merk is not null and p_tahun is not null then
    return query
      select nr.id, nr.kategori, nr.njkb, nr.bobot, coalesce(nr.dp_pkb, nr.njkb * nr.bobot), true
      from njkb_ref nr
      where nr.kode_merk = p_kode_merk and nr.tahun_buat = p_tahun
      limit 1;
    if found then return; end if;
  end if;

  if p_tahun is not null then
    -- a. merk + model persis (setelah normalisasi)
    return query
      select nr.id, nr.kategori, nr.njkb, nr.bobot, coalesce(nr.dp_pkb, nr.njkb * nr.bobot), true
      from njkb_ref nr
      where nr.tahun_buat = p_tahun
        and nr.merk_norm = v_merk and nr.type_norm = v_model
        and (v_kat is null or nr.kategori = v_kat)
        and (v_grup is null
             or (v_grup = 'R4' and nr.kategori not in ('RODA 2','RODA 3','RODA 3 PENUMPANG','MOBIL RODA 3 PENUMPANG','MOBIL RODA 3 BARANG'))
             or (v_grup = 'R2' and nr.kategori = 'RODA 2'))
      limit 1;
    if found then return; end if;

    -- b. kemiripan nama
    return query
      select nr.id, nr.kategori, nr.njkb, nr.bobot, coalesce(nr.dp_pkb, nr.njkb * nr.bobot), false
      from njkb_ref nr
      where nr.tahun_buat = p_tahun
        and (v_kat is null or nr.kategori = v_kat)
        and (v_grup is null
             or (v_grup = 'R4' and nr.kategori not in ('RODA 2','RODA 3','RODA 3 PENUMPANG','MOBIL RODA 3 PENUMPANG','MOBIL RODA 3 BARANG'))
             or (v_grup = 'R2' and nr.kategori = 'RODA 2'))
        and (v_merk = nr.merk_norm or similarity(nr.merk_norm, v_merk) > 0.45)
        and (v_model = nr.type_norm or similarity(nr.type_norm, v_model) > 0.35)
      order by similarity(nr.merk_norm, v_merk) + similarity(nr.type_norm, v_model) desc
      limit 1;
  end if;
  return;
end;
$$;
