// Penguraian lampiran NJKB (format lama per-sheet & format baru satu sheet) — dijalankan di browser.
import { cellToNumber, cellToString } from "@/lib/excel-helpers";

export type BarisNjkb = {
  kategori: string;
  kode_merk: string | null;
  merk: string | null;
  type: string | null;
  merk_norm: string;
  type_norm: string;
  tahun_buat: number;
  njkb: number;
  bobot: number;
  dp_pkb: number | null;
};

const KOLOM_WAJIB = ["KODE MERK", "MERK", "TYPE", "TAHUN BUAT", "NJKB", "BOBOT", "DP PKB"];

const norm = (t: unknown) =>
  (t ?? "").toString().toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

function namaKategoriDariSheet(nama: string): string | null {
  const bersih = nama.replace(/^\s*\d+[.,]\s*/, "").trim();
  if (!bersih || /njub/i.test(nama)) return null;
  return bersih.toUpperCase();
}

const sel = (r: unknown[], i: number | null | undefined) => (i === null || i === undefined ? null : r[i - 1]);

function headerLama(baris: unknown[][], maks = 30) {
  for (let r = 0; r < Math.min(maks, baris.length); r++) {
    const peta: Record<string, number> = {};
    baris[r].forEach((v, i) => {
      const k = cellToString(v).toUpperCase();
      if (KOLOM_WAJIB.includes(k)) peta[k] = i + 1;
    });
    if (KOLOM_WAJIB.every((k) => peta[k] !== undefined)) return { idx: r, peta };
  }
  return null;
}

function cari(cells: { t: string; c: number }[], ...kand: string[]) {
  for (const k of kand) {
    const f = cells.find((h) => h.t.includes(k.toUpperCase()));
    if (f) return f.c;
  }
  return null;
}

function headerBaru(baris: unknown[][], maks = 10) {
  for (let r = 0; r < Math.min(maks, baris.length); r++) {
    const cells = baris[r]
      .map((v, i) => ({ t: cellToString(v).toUpperCase(), c: i + 1 }))
      .filter((x) => x.t !== "");
    if (!cells.some((h) => h.t.includes("NM_MEREK_KB")) || !cells.some((h) => h.t.includes("NM_MODEL_KB")) || !cells.some((h) => h.t.includes("THN"))) continue;
    const k = {
      kode2025: cari(cells, "KD_MERK 2025", "KD MERK 2025"),
      kode2024: cari(cells, "KD_MEREK 2024", "KD MEREK 2024"),
      merk: cari(cells, "NM_MEREK_KB"),
      type: cari(cells, "NM_MODEL_KB"),
      thn: cari(cells, "THN"),
      njkb: cari(cells, "NJKB"),
      bobot: cari(cells, "BOBOT"),
      kategori: cari(cells, "JENIS DASAR 2", "UBEN"),
      bentuk: cari(cells, "BENTUK KEND", "BENTUK"),
    };
    if (k.merk === null || k.type === null || k.thn === null || k.njkb === null || k.kategori === null) continue;
    return { idx: r, k };
  }
  return null;
}

export function uraikanNjkb(sheets: { nama: string; baris: unknown[][] }[], label: (s: string) => string) {
  const hasil: BarisNjkb[] = [];
  const diproses: { nama: string; jumlah: number }[] = [];
  const dilewati: string[] = [];

  for (const s of sheets) {
    const kategori = namaKategoriDariSheet(s.nama);
    const hl = kategori ? headerLama(s.baris) : null;
    if (hl && kategori) {
      let jumlah = 0;
      for (let r = hl.idx + 1; r < s.baris.length; r++) {
        const row = s.baris[r];
        const merk = cellToString(sel(row, hl.peta["MERK"])) || null;
        const tahun = cellToNumber(sel(row, hl.peta["TAHUN BUAT"]) as any);
        const njkb = cellToNumber(sel(row, hl.peta["NJKB"]) as any);
        if (!tahun || njkb === null || !merk) continue;
        const type = cellToString(sel(row, hl.peta["TYPE"])) || null;
        hasil.push({
          kategori,
          kode_merk: cellToString(sel(row, hl.peta["KODE MERK"])) || null,
          merk,
          type,
          merk_norm: norm(merk),
          type_norm: norm(type),
          tahun_buat: Math.round(tahun),
          njkb,
          bobot: cellToNumber(sel(row, hl.peta["BOBOT"]) as any) ?? 1,
          dp_pkb: cellToNumber(sel(row, hl.peta["DP PKB"]) as any),
        });
        jumlah++;
      }
      diproses.push({ nama: label(s.nama), jumlah });
      continue;
    }

    const hb = headerBaru(s.baris);
    if (hb) {
      const { k } = hb;
      let jumlah = 0;
      for (let r = hb.idx + 1; r < s.baris.length; r++) {
        const row = s.baris[r];
        if (k.bentuk) {
          const bentuk = cellToString(sel(row, k.bentuk)).toUpperCase();
          if (bentuk && bentuk !== "A") continue;
        }
        const kode = cellToString(sel(row, k.kode2025)) || cellToString(sel(row, k.kode2024)) || null;
        const merk = cellToString(sel(row, k.merk)) || null;
        const type = cellToString(sel(row, k.type)) || null;
        const tahun = cellToNumber(sel(row, k.thn) as any);
        const njkb = cellToNumber(sel(row, k.njkb) as any);
        const bobot = k.bobot ? cellToNumber(sel(row, k.bobot) as any) : 1;
        const kat = cellToString(sel(row, k.kategori)).toUpperCase() || null;
        if (!tahun || njkb === null || !merk || !kat) continue;
        hasil.push({
          kategori: kat,
          kode_merk: kode,
          merk,
          type,
          merk_norm: norm(merk),
          type_norm: norm(type),
          tahun_buat: Math.round(tahun),
          njkb,
          bobot: bobot ?? 1,
          dp_pkb: Math.round(njkb * (bobot ?? 1) * 100) / 100,
        });
        jumlah++;
      }
      diproses.push({ nama: label(s.nama), jumlah });
      continue;
    }
    dilewati.push(label(s.nama));
  }
  return { hasil, diproses, dilewati };
}

export function gabungTanpaDobel(semua: BarisNjkb[]): BarisNjkb[] {
  const m = new Map<string, BarisNjkb>();
  for (const b of semua) {
    m.set(b.kode_merk ? `${b.kode_merk}__${b.tahun_buat}` : `null__${b.merk_norm}__${b.type_norm}__${b.tahun_buat}__${b.kategori}`, b);
  }
  return Array.from(m.values());
}
