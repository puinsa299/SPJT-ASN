import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { cellToNumber, cellToString } from "@/lib/excel-helpers";

// ----------------------------------------------------------------------------
// Import "Lampiran NJKB" (Pergub) — satu sheet per jenis/kategori kendaraan.
// Posisi header kolom BERBEDA-BEDA antar sheet (baris & kolom bisa beda),
// jadi header dicari dengan cara scan baris, bukan asumsi posisi tetap.
// Sheet NJUB (Nilai Jual Ubah Bentuk) dan sheet bantu dilewati.
// ----------------------------------------------------------------------------

const KOLOM_WAJIB = ["KODE MERK", "MERK", "TYPE", "TAHUN BUAT", "NJKB", "BOBOT", "DP PKB"];

function namaKategoriDariSheet(namaSheet: string): string | null {
  const bersih = namaSheet.replace(/^\s*\d+[.,]\s*/, "").trim();
  if (!bersih) return null;
  if (/njub/i.test(namaSheet)) return null; // lewati sheet Nilai Jual Ubah Bentuk
  return bersih.toUpperCase();
}

function normalizeTeks(t: string | null | undefined): string {
  return (t ?? "")
    .toString()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function cariHeaderFormatLama(ws: ExcelJS.Worksheet, maxBarisCek = 30): { rowNumber: number; colMap: Record<string, number> } | null {
  for (let r = 1; r <= Math.min(maxBarisCek, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const colMap: Record<string, number> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = cellToString(cell.value).toUpperCase().trim();
      if (KOLOM_WAJIB.includes(key)) colMap[key] = colNumber;
    });
    if (KOLOM_WAJIB.every((k) => colMap[k] !== undefined)) return { rowNumber: r, colMap };
  }
  return null;
}

function cariKolomMengandung(cells: { teks: string; colNumber: number }[], ...kandidat: string[]): number | null {
  for (const k of kandidat) {
    const f = cells.find((h) => h.teks.includes(k.toUpperCase()));
    if (f) return f.colNumber;
  }
  return null;
}

type KolomBaru = {
  kode_merk_2025: number | null; kode_merk_2024: number | null; merk: number; type: number;
  thn: number; njkb: number; bobot: number | null; kategori: number; bentuk: number | null;
};

// Format baru (Pergub 2025): satu sheet berisi semua jenis, kolom kategori = "JENIS DASAR 2"/"UBEN".
function cariHeaderFormatBaru(ws: ExcelJS.Worksheet, maxBarisCek = 10): { rowNumber: number; kolom: KolomBaru } | null {
  for (let r = 1; r <= Math.min(maxBarisCek, ws.rowCount); r++) {
    const cells: { teks: string; colNumber: number }[] = [];
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      cells.push({ teks: cellToString(cell.value).toUpperCase().trim(), colNumber });
    });
    if (!cells.some((h) => h.teks.includes("NM_MEREK_KB")) || !cells.some((h) => h.teks.includes("NM_MODEL_KB")) || !cells.some((h) => h.teks.includes("THN"))) continue;
    const merk = cariKolomMengandung(cells, "NM_MEREK_KB");
    const type = cariKolomMengandung(cells, "NM_MODEL_KB");
    const thn = cariKolomMengandung(cells, "THN");
    const njkb = cariKolomMengandung(cells, "NJKB");
    const kategori = cariKolomMengandung(cells, "JENIS DASAR 2", "UBEN");
    if (merk === null || type === null || thn === null || njkb === null || kategori === null) continue;
    return {
      rowNumber: r,
      kolom: {
        kode_merk_2025: cariKolomMengandung(cells, "KD_MERK 2025", "KD MERK 2025"),
        kode_merk_2024: cariKolomMengandung(cells, "KD_MEREK 2024", "KD MEREK 2024"),
        merk, type, thn, njkb, kategori,
        bobot: cariKolomMengandung(cells, "BOBOT"),
        bentuk: cariKolomMengandung(cells, "BENTUK KEND", "BENTUK"),
      },
    };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("file").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "File wajib diupload" }, { status: 400 });

  type BarisNjkb = {
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

  const semuaBaris: BarisNjkb[] = [];
  const sheetDiproses: { nama: string; kategori: string; jumlah: number }[] = [];
  const sheetDilewati: string[] = [];

  for (const file of files) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);

    for (const ws of workbook.worksheets) {
      const label = files.length > 1 ? `${file.name}:${ws.name}` : ws.name;
      const kategori = namaKategoriDariSheet(ws.name);

      // 1) format lama: satu sheet per kategori, kolom KODE MERK / TAHUN BUAT / DP PKB
      const hLama = kategori ? cariHeaderFormatLama(ws) : null;
      if (hLama && kategori) {
        let jumlah = 0;
        const { rowNumber: headerRow, colMap } = hLama;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= headerRow) return;
          const merk = cellToString(row.getCell(colMap["MERK"]).value) || null;
          const type = cellToString(row.getCell(colMap["TYPE"]).value) || null;
          const tahunBuat = cellToNumber(row.getCell(colMap["TAHUN BUAT"]).value);
          const njkb = cellToNumber(row.getCell(colMap["NJKB"]).value);
          const bobot = cellToNumber(row.getCell(colMap["BOBOT"]).value);
          if (!tahunBuat || njkb === null || !merk) return;
          semuaBaris.push({
            kategori,
            kode_merk: cellToString(row.getCell(colMap["KODE MERK"]).value) || null,
            merk, type,
            merk_norm: normalizeTeks(merk),
            type_norm: normalizeTeks(type),
            tahun_buat: Math.round(tahunBuat),
            njkb,
            bobot: bobot ?? 1,
            dp_pkb: cellToNumber(row.getCell(colMap["DP PKB"]).value),
          });
          jumlah++;
        });
        sheetDiproses.push({ nama: label, kategori, jumlah });
        continue;
      }

      // 2) format baru: satu sheet berisi banyak kategori; baris ubah-bentuk (bentuk <> "A") dilewati
      const hBaru = cariHeaderFormatBaru(ws);
      if (hBaru) {
        let jumlah = 0;
        const { rowNumber: headerRow, kolom } = hBaru;
        ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= headerRow) return;
          if (kolom.bentuk) {
            const bentuk = cellToString(row.getCell(kolom.bentuk).value).toUpperCase().trim();
            if (bentuk && bentuk !== "A") return;
          }
          const kode =
            (kolom.kode_merk_2025 ? cellToString(row.getCell(kolom.kode_merk_2025).value) : "") ||
            (kolom.kode_merk_2024 ? cellToString(row.getCell(kolom.kode_merk_2024).value) : "") ||
            null;
          const merk = cellToString(row.getCell(kolom.merk).value) || null;
          const type = cellToString(row.getCell(kolom.type).value) || null;
          const tahunBuat = cellToNumber(row.getCell(kolom.thn).value);
          const njkb = cellToNumber(row.getCell(kolom.njkb).value);
          const bobot = kolom.bobot ? cellToNumber(row.getCell(kolom.bobot).value) : 1;
          const kat = cellToString(row.getCell(kolom.kategori).value).toUpperCase().trim() || null;
          if (!tahunBuat || njkb === null || !merk || !kat) return;
          semuaBaris.push({
            kategori: kat,
            kode_merk: kode,
            merk, type,
            merk_norm: normalizeTeks(merk),
            type_norm: normalizeTeks(type),
            tahun_buat: Math.round(tahunBuat),
            njkb,
            bobot: bobot ?? 1,
            dp_pkb: Math.round(njkb * (bobot ?? 1) * 100) / 100,
          });
          jumlah++;
        });
        sheetDiproses.push({ nama: label, kategori: "beragam", jumlah });
        continue;
      }

      sheetDilewati.push(label);
    }
  }

  if (semuaBaris.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris NJKB yang terbaca. Pastikan file sesuai format lampiran NJKB Pergub." },
      { status: 400 }
    );
  }

  // Kalau ada kode_merk yang dobel persis sama (kode_merk + tahun_buat sama,
  // bisa terjadi antar sheet kalau filenya tumpang-tindih) -> pakai yang terakhir.
  const dedupKey = (b: BarisNjkb) =>
    b.kode_merk ? `${b.kode_merk}__${b.tahun_buat}` : `null__${b.merk_norm}__${b.type_norm}__${b.tahun_buat}__${b.kategori}`;
  const dedupMap = new Map<string, BarisNjkb>();
  semuaBaris.forEach((b) => dedupMap.set(dedupKey(b), b));
  const barisFinal = Array.from(dedupMap.values());

  // ---- Timpa seluruh isi njkb_ref dengan data baru (aman diulang) ----
  await supabase.from("njkb_ref").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const CHUNK = 1000;
  for (let i = 0; i < barisFinal.length; i += CHUNK) {
    const chunk = barisFinal.slice(i, i + CHUNK);
    const { error } = await supabase.from("njkb_ref").insert(chunk);
    if (error) {
      return NextResponse.json(
        { error: `Gagal menyimpan data NJKB pada baris ke-${i}: ${error.message}` },
        { status: 500 }
      );
    }
  }

  await supabase.from("import_log").insert({
    jenis_import: "Database Master",
    nama_file: files.map((f) => f.name).join(", "),
    jumlah_ditambah: barisFinal.length,
    catatan: `Import tabel NJKB — ${sheetDiproses.map((s) => `${s.kategori}: ${s.jumlah}`).join(", ")}`,
    created_by: user.email,
  });

  await supabase.from("activity_log").insert({
    jenis_aksi: "import_njkb",
    deskripsi: `Import tabel NJKB: ${barisFinal.length} baris dari ${sheetDiproses.length} kategori (sheet dilewati: ${sheetDilewati.join(", ") || "-"})`,
    created_by: user.email,
  });

  return NextResponse.redirect(
    new URL(
      `/import?sukses=njkb&jumlah=${barisFinal.length}&kategori=${sheetDiproses.length}`,
      req.url
    ),
    { status: 303 }
  );
}
