import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { cellToString } from "@/lib/excel-helpers";
import { normalizeNopol } from "@/lib/nopol";

// ----------------------------------------------------------------------------
// Import "Warna Plat" — isi/koreksi massal kolom kendaraan.warna_plat
// (Merah/Hitam) lewat excel berisi 2 kolom: Nomor Polisi + Warna Plat.
// Dicocokkan ke kendaraan via nomor polisi (dinormalisasi sama seperti
// import Database Master). Aman diulang — nomor polisi yang sama akan
// menimpa warna plat sebelumnya; nomor polisi yang tidak ada di sistem
// dilewati (dihitung & ditampilkan di catatan import_log).
// ----------------------------------------------------------------------------

function cariKolomNopol(headerCells: { teks: string; colNumber: number }[]): number | null {
  const kandidat = ["NOMOR POLISI", "NO POLISI", "NO. POLISI", "NOPOL", "PLAT"];
  for (const k of kandidat) {
    const found = headerCells.find((h) => h.teks === k || h.teks.includes(k));
    if (found) return found.colNumber;
  }
  return null;
}

function cariKolomWarna(headerCells: { teks: string; colNumber: number }[]): number | null {
  const kandidat = ["WARNA PLAT", "WARNA", "JENIS PLAT"];
  for (const k of kandidat) {
    const found = headerCells.find((h) => h.teks === k || h.teks.includes(k));
    if (found) return found.colNumber;
  }
  return null;
}

function normalisasiWarna(raw: string): "Merah" | "Hitam" | null {
  const t = raw.toUpperCase().trim();
  if (t.includes("MERAH")) return "Merah";
  if (t.includes("HITAM")) return "Hitam";
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
  const ws = workbook.worksheets[0];
  if (!ws) {
    return NextResponse.json({ error: "File tidak punya sheet yang bisa dibaca." }, { status: 400 });
  }

  let kolomNopol: number | null = null;
  let kolomWarna: number | null = null;
  let headerRow = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const headerCells: { teks: string; colNumber: number }[] = [];
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headerCells.push({ teks: cellToString(cell.value).toUpperCase().trim(), colNumber });
    });
    const nopolCol = cariKolomNopol(headerCells);
    const warnaCol = cariKolomWarna(headerCells);
    if (nopolCol && warnaCol) {
      kolomNopol = nopolCol;
      kolomWarna = warnaCol;
      headerRow = r;
      break;
    }
  }

  if (!kolomNopol || !kolomWarna) {
    return NextResponse.json(
      { error: "Kolom 'Nomor Polisi' dan 'Warna Plat' tidak ditemukan di 10 baris pertama file." },
      { status: 400 }
    );
  }

  const baris: { nomor_polisi: string; warna_plat: "Merah" | "Hitam" }[] = [];
  let dilewatiWarnaTakDikenal = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const nopolRaw = cellToString(row.getCell(kolomNopol!).value);
    const warnaRaw = cellToString(row.getCell(kolomWarna!).value);
    if (!nopolRaw) return;
    const nopol = normalizeNopol(nopolRaw);
    const warna = normalisasiWarna(warnaRaw);
    if (!nopol) return;
    if (!warna) {
      dilewatiWarnaTakDikenal++;
      return;
    }
    baris.push({ nomor_polisi: nopol, warna_plat: warna });
  });

  if (baris.length === 0) {
    return NextResponse.json(
      { error: "Tidak ada baris valid (Nomor Polisi + Warna Plat 'Merah'/'Hitam') yang terbaca." },
      { status: 400 }
    );
  }

  // Cek nomor polisi mana yang memang ada di sistem, supaya bisa dilaporkan
  // berapa yang dilewati (tidak ditemukan).
  const nopolList = baris.map((b) => b.nomor_polisi);
  const ditemukan = new Set<string>();
  const CHUNK = 1000;
  for (let i = 0; i < nopolList.length; i += CHUNK) {
    const chunk = nopolList.slice(i, i + CHUNK);
    const { data } = await supabase.from("kendaraan").select("nomor_polisi").in("nomor_polisi", chunk);
    (data ?? []).forEach((k) => ditemukan.add(k.nomor_polisi));
  }
  const barisValid = baris.filter((b) => ditemukan.has(b.nomor_polisi));
  const jumlahTakDitemukan = baris.length - barisValid.length;

  // Update per-baris (warna beda-beda per nopol) tapi dikirim paralel per
  // kelompok kecil, supaya tidak menunggu satu-satu secara berurutan kalau
  // jumlahnya banyak (ribuan baris).
  let jumlahDiupdate = 0;
  const PARALEL = 25;
  for (let i = 0; i < barisValid.length; i += PARALEL) {
    const kelompok = barisValid.slice(i, i + PARALEL);
    const hasil = await Promise.all(
      kelompok.map((b) =>
        supabase.from("kendaraan").update({ warna_plat: b.warna_plat }).eq("nomor_polisi", b.nomor_polisi)
      )
    );
    jumlahDiupdate += hasil.filter((r) => !r.error).length;
  }

  await supabase.from("import_log").insert({
    jenis_import: "Database Master",
    nama_file: file.name,
    jumlah_ditambah: jumlahDiupdate,
    catatan: `Import Warna Plat — ${jumlahDiupdate} kendaraan diupdate, ${jumlahTakDitemukan} nomor polisi tidak ditemukan di sistem, ${dilewatiWarnaTakDikenal} baris warna plat tidak dikenali (bukan Merah/Hitam).`,
    created_by: user.email,
  });

  await supabase.from("activity_log").insert({
    jenis_aksi: "import_warna_plat",
    deskripsi: `Import Warna Plat: ${jumlahDiupdate} kendaraan diupdate (tidak ditemukan: ${jumlahTakDitemukan}, warna tak dikenali: ${dilewatiWarnaTakDikenal})`,
    created_by: user.email,
  });

  return NextResponse.redirect(
    new URL(
      `/import?sukses=warna-plat&jumlah=${jumlahDiupdate}&takditemukan=${jumlahTakDitemukan}`,
      req.url
    ),
    { status: 303 }
  );
}
