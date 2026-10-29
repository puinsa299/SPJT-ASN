-- ============================================================================
-- 08_clean_nama_koma.sql — update fn_clean_nama: tambah gelar S.AP/S.Tr.IP,
-- dan tambahkan koma antara nama & gelar suffix (bukan gelar prefix seperti Dr./H.)
-- ============================================================================

create or replace function fn_clean_nama(nama text)
returns text as $$
declare
  gelar_map jsonb := '{
    "se":"S.E.", "sh":"S.H.", "st":"S.T.", "skom":"S.Kom.", "spsi":"S.Psi.",
    "ssos":"S.Sos.", "spd":"S.Pd.", "sip":"S.IP", "ssi":"S.Si.", "sag":"S.Ag.",
    "sfarm":"S.Farm.", "shut":"S.Hut.", "spt":"S.Pt.", "sked":"S.Ked.",
    "spar":"S.Par.", "ssn":"S.Sn.", "ptr":"S.Tr.", "sap":"S.AP", "strip":"S.Tr.IP",
    "mm":"M.M.", "mpsi":"M.Psi.", "mh":"M.H.", "msi":"M.Si.", "mkom":"M.Kom.",
    "map":"M.AP", "mpd":"M.Pd.", "mt":"M.T.", "mba":"M.B.A.", "mpa":"M.PA",
    "mars":"M.ARS", "mkes":"M.Kes.", "mak":"M.Ak.",
    "ak":"Ak.", "cpa":"CPA", "dr":"Dr.", "ir":"Ir.", "drs":"Drs.", "dra":"Dra.",
    "prof":"Prof.", "hj":"Hj.", "h":"H."
  }'::jsonb;
  words text[];
  w text;
  key text;
  parts text[] := '{}';       -- teks tiap bagian
  part_types text[] := '{}';  -- 'name' / 'gelar' sejajar dengan parts
  pending text[] := '{}';
  result text := '';
  i int;
  sep text;
begin
  if nama is null then return null; end if;
  nama := trim(regexp_replace(replace(nama, ',', ' '), '\s+', ' ', 'g'));
  if nama = '' then return null; end if;
  words := string_to_array(nama, ' ');

  foreach w in array words loop
    key := lower(replace(w, '.', ''));
    if gelar_map ? key then
      pending := array_append(pending, gelar_map->>key);
    else
      if array_length(pending, 1) > 0 then
        parts := array_append(parts, array_to_string(pending, ', '));
        part_types := array_append(part_types, 'gelar');
        pending := '{}';
      end if;
      parts := array_append(parts, initcap(w));
      part_types := array_append(part_types, 'name');
    end if;
  end loop;

  if array_length(pending, 1) > 0 then
    parts := array_append(parts, array_to_string(pending, ', '));
    part_types := array_append(part_types, 'gelar');
  end if;

  for i in 1 .. array_length(parts, 1) loop
    if i = 1 then
      result := parts[i];
    else
      -- koma HANYA saat transisi nama -> gelar (gelar sebagai suffix di belakang nama)
      if part_types[i-1] = 'name' and part_types[i] = 'gelar' then
        sep := ', ';
      else
        sep := ' ';
      end if;
      result := result || sep || parts[i];
    end if;
  end loop;

  return result;
end;
$$ language plpgsql immutable;

-- Terapkan ulang ke seluruh nama pemilik yang sudah ada
update kendaraan set nama_pemilik = fn_clean_nama(nama_pemilik) where nama_pemilik is not null;
