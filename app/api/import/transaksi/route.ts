import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol } from "@/lib/nopol";
import { cellToDateString, cellToNumber, cellToString } from "@/lib/excel-helpers";
import { toProperCase } from "@/lib/text-clean";

// ----------------------------------------------------------------------------
// Mapping header kolom (lowercase, trim) -> field internal.
// Cocok dengan struktur dump transaksi Samsat mentah (contoh: SMD_Juli_2026.xlsx).
// File ini TIDAK punya kolom instansi/OPD — jadi hanya dipakai untuk COCOKKAN
// ke nopol yang SUDAH ada di database (dari Database Master). Nopol yang tidak
// ketemu diabaikan (bisa jadi kendaraan warga biasa, bukan aset ASN).
// ----------------------------------------------------------------------------
const HEADER_MAP: Record<string, string> = {
  no_polisi: "nomor_polisi",
  nm_pemilik: "nm_pemilik",
  tgl_bayar: "tgl_bayar",
  tgl_akhir_pkb: "tgl_akhir_pkb",
  pkb_pokok: "pkb_pokok",
  pkb_opsen_pok: "pkb_opsen_pok",
  bea_swdkllj_pok: "bea_swdkllj_pok",
  // Atribut kendaraan yang ikut ada di dump transaksi -- dipakai untuk melengkapi
  // data kendaraan (golongan SWDKLLJ, angkutan umum, STNK/Plat, lampiran surat).
  kd_jenis_kb: "kd_jenis_kb",
  jumlah_cc: "jumlah_cc",
  kd_plat: "kd_plat",
  no_chasis: "no_chasis",
  kd_merek_kb: "kd_merek_kb",
  tg_awal_stnk: "tg_awal_stnk",
};

const CHUNK = 500;

function bufferToStream(buffer: Buffer) {
  const { Readable } = require("stream");
  return Readable.from(buffer);
}

// Baca file Excel besar pakai STREAMING reader (baris demi baris), jauh lebih
// cepat & hemat memori dibanding load seluruh 89 kolom x puluhan ribu baris
// sekaligus ke memori — ini kunci supaya tidak timeout di file besar (30rb+ baris).
async function parseExcelStreaming(buffer: Buffer): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  const colIndexToField: Record<number, string> = {};
  let headerParsed = false;

  const stream = ExcelJS.stream.xlsx as any;
  const workbookReader = new stream.WorkbookReader(bufferToStream(buffer), {});

  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      if (!headerParsed) {
        row.eachCell({ includeEmpty: false }, (cell: any, colNumber: number) => {
          const key = cellToString(cell.value).toLowerCase();
          if (HEADER_MAP[key]) colIndexToField[colNumber] = HEADER_MAP[key];
        });
        headerParsed = true;
        continue;
      }

      const rec: Record<string, any> = {};
      for (const [colNumber, field] of Object.entries(colIndexToField)) {
        rec[field] = row.getCell(Number(colNumber)).value;
      }
      if (rec.nomor_polisi) rows.push(rec);
    }
    break; // hanya sheet pertama
  }

  return rows;
}

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const files = formData.getAll("file") as File[];
  if (!files || files.length === 0) {
    return NextResponse.json({ error: "File wajib diupload" }, { status: 400 });
  }

  // ---- 1. Ambil SEMUA kendaraan yang sudah terdata (sekali saja): nopol, id, nama ----
  const kendaraanMap = new Map<string, { id: string; nama_pemilik: string | null; kode_merk: string | null }>();
  {
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await supabase
        .from("kendaraan")
        .select("id, nomor_polisi, nama_pemilik, kode_merk")
        .range(from, from + PAGE - 1);
      (data ?? []).forEach((k) => kendaraanMap.set(k.nomor_polisi, { id: k.id, nama_pemilik: k.nama_pemilik, kode_merk: k.kode_merk }));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
  }

  let totalDicocokkan = 0;
  let totalDiabaikan = 0;
  let totalPembayaranBaru = 0;
  let totalBelumBalikNama = 0;
  const namaFileList: string[] = [];

  for (const file of files) {
    namaFileList.push(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());

    let rawRows: Record<string, any>[];
    try {
      rawRows = await parseExcelStreaming(buffer);
    } catch (e) {
      // fallback ke parser biasa kalau format file tidak didukung streaming reader
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as any);
      const sheet = workbook.worksheets[0];
      rawRows = [];
      if (sheet) {
        const colIndexToField: Record<number, string> = {};
        sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const key = cellToString(cell.value).toLowerCase();
          if (HEADER_MAP[key]) colIndexToField[colNumber] = HEADER_MAP[key];
        });
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return;
          const rec: Record<string, any> = {};
          for (const [colNumber, field] of Object.entries(colIndexToField)) {
            rec[field] = row.getCell(Number(colNumber)).value;
          }
          if (rec.nomor_polisi) rawRows.push(rec);
        });
      }
    }

    const parsed = rawRows
      .map((r) => ({
        nomor_polisi: normalizeNopol(cellToString(r.nomor_polisi)),
        nama_pemilik_file: toProperCase(cellToString(r.nm_pemilik)),
        tanggal_bayar: cellToDateString(r.tgl_bayar),
        masa_pajak_periode: cellToDateString(r.tgl_akhir_pkb),
        pokok_pkb: cellToNumber(r.pkb_pokok),
        opsen: cellToNumber(r.pkb_opsen_pok),
        swdkllj: cellToNumber(r.bea_swdkllj_pok),
        kode_jenis: cellToString(r.kd_jenis_kb).trim().toUpperCase() || null,
        cc: cellToNumber(r.jumlah_cc),
        kd_plat: cellToString(r.kd_plat).trim() || null,
        no_rangka: cellToString(r.no_chasis).trim() || null,
        kode_merk: cellToString(r.kd_merek_kb).trim() || null,
        tanggal_awal_stnk: cellToDateString(r.tg_awal_stnk),
      }))
      .filter((r) => r.nomor_polisi && r.tanggal_bayar);

    // ---- 2. Pisahkan mana yang cocok ke kendaraan kita, mana yang diabaikan ----
    const cocok = parsed.filter((r) => kendaraanMap.has(r.nomor_polisi));
    totalDicocokkan += cocok.length;
    totalDiabaikan += parsed.length - cocok.length;

    if (cocok.length === 0) continue;

    // ---- 3. Cek tanggal bayar terakhir yang sudah tersimpan, utk hindari duplikat ----
    const kendaraanIds = Array.from(new Set(cocok.map((r) => kendaraanMap.get(r.nomor_polisi)!.id)));
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
      const kendaraanId = kendaraanMap.get(r.nomor_polisi)!.id;
      const terakhir = pembayaranTerakhirMap.get(kendaraanId);
      return terakhir !== r.tanggal_bayar;
    });

    // ---- 4. Insert transaksi baru (batch) ----
    const transaksiPayload = transaksiBaru.map((r) => ({
      kendaraan_id: kendaraanMap.get(r.nomor_polisi)!.id,
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

    // ---- 5. Update jatuh_tempo + cek "belum balik nama" — BATCH pakai upsert,
    //     BUKAN update satu-satu (ini penyebab utama timeout sebelumnya) ----
    const kendaraanUpdatePayload: Record<string, any>[] = [];
    const seenIds = new Set<string>();

    for (const r of cocok) {
      const info = kendaraanMap.get(r.nomor_polisi)!;
      if (seenIds.has(info.id)) continue; // 1 kendaraan cuma diupdate 1x per import walau ada >1 baris transaksi
      seenIds.add(info.id);

      const update: any = { id: info.id };
      let ada_perubahan = false;

      if (r.masa_pajak_periode) {
        update.jatuh_tempo = r.masa_pajak_periode;
        ada_perubahan = true;
      }

      // lengkapi atribut kendaraan hanya bila file memuatnya (tidak menimpa dengan kosong)
      if (r.kode_jenis) { update.kode_jenis = r.kode_jenis; ada_perubahan = true; }
      if (r.cc !== null && r.cc !== undefined && !Number.isNaN(Number(r.cc))) { update.cc = Math.round(Number(r.cc)); ada_perubahan = true; }
      if (r.kd_plat) { update.kd_plat = r.kd_plat; ada_perubahan = true; }
      if (r.no_rangka) { update.no_rangka = r.no_rangka; ada_perubahan = true; }
      if (r.kode_merk && !info.kode_merk) { update.kode_merk = r.kode_merk; ada_perubahan = true; }
      if (r.tanggal_awal_stnk) { update.tanggal_awal_stnk = r.tanggal_awal_stnk; ada_perubahan = true; }

      if (r.nama_pemilik_file) {
        const namaTersimpan = (info.nama_pemilik ?? "").trim().toLowerCase();
        const namaFile = r.nama_pemilik_file.trim().toLowerCase();
        const belumBalikNama = namaTersimpan !== "" && namaTersimpan !== namaFile;
        update.belum_balik_nama = belumBalikNama;
        update.nama_pemilik_transaksi = belumBalikNama ? r.nama_pemilik_file : null;
        ada_perubahan = true;
        if (belumBalikNama) totalBelumBalikNama += 1;
      }

      if (ada_perubahan) kendaraanUpdatePayload.push(update);
    }

    for (let i = 0; i < kendaraanUpdatePayload.length; i += CHUNK) {
      await supabase.from("kendaraan").upsert(kendaraanUpdatePayload.slice(i, i + CHUNK), { onConflict: "id" });
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
    deskripsi: `Import Transaksi Bulanan (${namaFileList.join(", ")}): ${totalPembayaranBaru} pembayaran baru tercatat dari ${totalDicocokkan} nopol cocok, ${totalDiabaikan} nopol diabaikan, ${totalBelumBalikNama} kendaraan terdeteksi belum balik nama.`,
    created_by: user.email,
  });

  return NextResponse.redirect(
    new URL(
      `/import?sukses=transaksi&dicocokkan=${totalDicocokkan}&diabaikan=${totalDiabaikan}&bayar_baru=${totalPembayaranBaru}&belum_balik_nama=${totalBelumBalikNama}`,
      req.url
    ),
    { status: 303 }
  );
}
