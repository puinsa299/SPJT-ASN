import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol } from "@/lib/nopol";
import { cellToDateString, cellToNumber, cellToString } from "@/lib/excel-helpers";

// ----------------------------------------------------------------------------
// Mapping header kolom (lowercase, trim) -> field internal.
// Cocok dengan struktur dump transaksi Samsat mentah (contoh: SMD_Juli_2026.xlsx).
// File ini TIDAK punya kolom instansi/OPD — jadi hanya dipakai untuk COCOKKAN
// ke nopol yang SUDAH ada di database (dari Database Master). Nopol yang tidak
// ketemu diabaikan (bisa jadi kendaraan warga biasa, bukan aset ASN).
// ----------------------------------------------------------------------------
const HEADER_MAP: Record<string, string> = {
  no_polisi: "nomor_polisi",
  tgl_bayar: "tgl_bayar",
  tgl_akhir_pkb: "tgl_akhir_pkb",
  pkb_pokok: "pkb_pokok",
  pkb_opsen_pok: "pkb_opsen_pok",
  bea_swdkllj_pok: "bea_swdkllj_pok",
};

const CHUNK = 500;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("file") as File[];
  if (!files || files.length === 0) {
    return NextResponse.json({ error: "File wajib diupload" }, { status: 400 });
  }

  // ---- 1. Ambil SEMUA nomor_polisi kendaraan yang sudah terdata (sekali saja),
  //     supaya pencocokan tiap baris file dilakukan di memori, bukan query per-baris. ----
  const kendaraanMap = new Map<string, string>(); // nomor_polisi -> kendaraan_id
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("kendaraan")
        .select("id, nomor_polisi")
        .range(from, from + PAGE - 1);
      (data ?? []).forEach((k) => kendaraanMap.set(k.nomor_polisi, k.id));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }

  let totalDicocokkan = 0;
  let totalDiabaikan = 0;
  let totalPembayaranBaru = 0;
  const namaFileList: string[] = [];

  for (const file of files) {
    namaFileList.push(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) continue;

    const headerRow = sheet.getRow(1);
    const colIndexToField: Record<number, string> = {};
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const key = cellToString(cell.value).toLowerCase();
      if (HEADER_MAP[key]) colIndexToField[colNumber] = HEADER_MAP[key];
    });

    if (Object.keys(colIndexToField).length === 0) {
      continue; // sheet tidak dikenali formatnya, lewati filenya
    }

    type Row = Record<string, any>;
    const rows: Row[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const rec: Row = {};
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const field = colIndexToField[colNumber];
        if (field) rec[field] = cell.value;
      });
      if (rec.nomor_polisi) rows.push(rec);
    });

    const parsed = rows
      .map((r) => ({
        nomor_polisi: normalizeNopol(cellToString(r.nomor_polisi)),
        tanggal_bayar: cellToDateString(r.tgl_bayar),
        masa_pajak_periode: cellToDateString(r.tgl_akhir_pkb),
        pokok_pkb: cellToNumber(r.pkb_pokok),
        opsen: cellToNumber(r.pkb_opsen_pok),
        swdkllj: cellToNumber(r.bea_swdkllj_pok),
      }))
      .filter((r) => r.nomor_polisi && r.tanggal_bayar);

    // ---- 2. Pisahkan mana yang cocok ke kendaraan kita, mana yang diabaikan ----
    const cocok = parsed.filter((r) => kendaraanMap.has(r.nomor_polisi));
    totalDicocokkan += cocok.length;
    totalDiabaikan += parsed.length - cocok.length;

    if (cocok.length === 0) continue;

    // ---- 3. Cek tanggal bayar terakhir yang sudah tersimpan, utk hindari duplikat ----
    const kendaraanIds = Array.from(new Set(cocok.map((r) => kendaraanMap.get(r.nomor_polisi)!)));
    const pembayaranTerakhirMap = new Map<string, string>();
    for (let i = 0; i < kendaraanIds.length; i += CHUNK) {
      const { data } = await supabase
        .from("v_kendaraan_pembayaran_terakhir")
        .select("kendaraan_id, tanggal_bayar_terakhir")
        .in("kendaraan_id", kendaraanIds.slice(i, i + CHUNK));
      (data ?? []).forEach((p) => {
        if (p.tanggal_bayar_terakhir) pembayaranTerakhirMap.set(p.kendaraan_id, p.tanggal_bayar_terakhir);
      });
    }

    const transaksiBaru = cocok.filter((r) => {
      const kendaraanId = kendaraanMap.get(r.nomor_polisi)!;
      const terakhir = pembayaranTerakhirMap.get(kendaraanId);
      return terakhir !== r.tanggal_bayar;
    });

    // ---- 4. Insert transaksi baru ----
    const transaksiPayload = transaksiBaru.map((r) => ({
      kendaraan_id: kendaraanMap.get(r.nomor_polisi),
      tanggal_bayar: r.tanggal_bayar,
      masa_pajak_periode: r.masa_pajak_periode,
      pokok_pkb: r.pokok_pkb,
      opsen: r.opsen, // sudah ada eksplisit di file ini, tidak perlu dihitung otomatis
      swdkllj: r.swdkllj,
    }));

    for (let i = 0; i < transaksiPayload.length; i += CHUNK) {
      await supabase.from("transaksi_pembayaran").insert(transaksiPayload.slice(i, i + CHUNK));
    }
    totalPembayaranBaru += transaksiPayload.length;

    // ---- 5. Update jatuh_tempo kendaraan (masa pajak baru setelah bayar) ----
    for (const r of transaksiBaru) {
      if (!r.masa_pajak_periode) continue;
      await supabase
        .from("kendaraan")
        .update({ jatuh_tempo: r.masa_pajak_periode })
        .eq("id", kendaraanMap.get(r.nomor_polisi));
    }

    await supabase.from("import_log").insert({
      jenis_import: "Transaksi Bulanan",
      nama_file: file.name,
      jumlah_diupdate: transaksiPayload.length,
      jumlah_diabaikan: parsed.length - cocok.length,
      created_by: user.email,
    });
  }

  await supabase.from("activity_log").insert({
    jenis_aksi: "import_transaksi_bulanan",
    deskripsi: `Import Transaksi Bulanan (${namaFileList.join(", ")}): ${totalPembayaranBaru} pembayaran baru tercatat dari ${totalDicocokkan} nopol cocok, ${totalDiabaikan} nopol diabaikan (tidak ada di database).`,
    created_by: user.email,
  });

  return NextResponse.redirect(
    new URL(
      `/import?sukses=transaksi&dicocokkan=${totalDicocokkan}&diabaikan=${totalDiabaikan}&bayar_baru=${totalPembayaranBaru}`,
      req.url
    ),
    { status: 303 }
  );
}
