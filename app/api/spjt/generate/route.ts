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

// Cari baris header dalam N baris pertama sebuah sheet: baris yang memuat
// (minimal) semua nama kolom wajib di atas, posisi kolom boleh beda-beda.
function cariHeader(ws: ExcelJS.Worksheet, maxBarisCek = 30): { rowNumber: number; colMap: Record<string, number> } | null {
  for (let r = 1; r <= Math.min(maxBarisCek, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const colMap: Record<string, number> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = cellToString(cell.value).toUpperCase().trim();
      if (KOLOM_WAJIB.includes(key)) colMap[key] = colNumber;
    });
    if (KOLOM_WAJIB.every((k) => colMap[k] !== undefined)) {
      return { rowNumber: r, colMap };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "File wajib diupload" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

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

  for (const ws of workbook.worksheets) {
    const kategori = namaKategoriDariSheet(ws.name);
    if (!kategori) {
      sheetDilewati.push(ws.name);
      continue;
    }

    const header = cariHeader(ws);
    if (!header) {
      sheetDilewati.push(`${ws.name} (header tidak ditemukan)`);
      continue;
    }

    let jumlahSheet = 0;
    const { rowNumber: headerRow, colMap } = header;

    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= headerRow) return;

      const kodeMerk = cellToString(row.getCell(colMap["KODE MERK"]).value) || null;
      const merk = cellToString(row.getCell(colMap["MERK"]).value) || null;
      const type = cellToString(row.getCell(colMap["TYPE"]).value) || null;
      const tahunBuat = cellToNumber(row.getCell(colMap["TAHUN BUAT"]).value);
      const njkb = cellToNumber(row.getCell(colMap["NJKB"]).value);
      const bobot = cellToNumber(row.getCell(colMap["BOBOT"]).value);
      const dpPkb = cellToNumber(row.getCell(colMap["DP PKB"]).value);

      // baris tanpa tahun/NJKB/merk dianggap bukan data (judul ulang, baris kosong, dll)
      if (!tahunBuat || njkb === null || !merk) return;

      semuaBaris.push({
        kategori,
        kode_merk: kodeMerk,
        merk,
        type,
        merk_norm: normalizeTeks(merk),
        type_norm: normalizeTeks(type),
        tahun_buat: Math.round(tahunBuat),
        njkb,
        bobot: bobot ?? 1,
        dp_pkb: dpPkb,
      });
      jumlahSheet++;
    });

    sheetDiproses.push({ nama: ws.name, kategori, jumlah: jumlahSheet });
  }

  if (semuaBaris.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris NJKB yang terbaca. Pastikan file sesuai format lampiran NJKB Pergub." },
      { status: 400 }
    );
  }

  // Kalau ada kode_merk yang dobel persis sama (kode_merk + tahun_buat sama,
  // bisa terjadi antar sheet kalau filenya tumpang-tindih) -> pakai yang terakhir.
  const dedupKey = (b: BarisNjkb) => `${b.kode_merk ?? "null"}__${b.tahun_buat}`;
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
    nama_file: file.name,
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
