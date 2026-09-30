import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol, platFromNopol } from "@/lib/nopol";
import { cellToDateString, cellToNumber, cellToString } from "@/lib/excel-helpers";
import { toProperCase } from "@/lib/text-clean";

// ----------------------------------------------------------------------------
// Mapping header kolom (lowercase, trim) -> field internal.
// Cocok dengan struktur sheet clean_datamaster_smd / Master Fixed.
// ----------------------------------------------------------------------------
const HEADER_MAP: Record<string, string> = {
  "nomor polisi": "nomor_polisi",
  "nama pemilik": "nama_pemilik",
  "instansi": "instansi",
  "standardized instansi": "standardized_instansi",
  "jenis kendaraan": "jenis_kendaraan",
  "cleaned": "nopol_cleaned", // nomor polisi yang sudah dibersihkan/dirapikan formatnya
  "tanggal jatuh tempo": "tanggal_jatuh_tempo",
  "jumlah pkb": "jumlah_pkb",
  "nm_merek_kb": "merk",
  "nm_model_kb": "model",
  "th_rakitan": "tahun",
  "tg_akhir_pkb": "tg_akhir_pkb",
  "tg_bayar": "tg_bayar",
  "bea_pkb_pok": "bea_pkb_pok",
};

export async function POST(req: NextRequest) {
  const supabase = createClient();

  // pastikan yang mengakses memang admin login (selain proteksi middleware, jaga2 dipanggil langsung)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const kategori = formData.get("kategori") as string | null;

  if (!file) return NextResponse.json({ error: "File wajib diupload" }, { status: 400 });
  if (kategori !== "Pemerintah Provinsi Kalimantan Timur" && kategori !== "Pemerintah Kota Samarinda") {
    return NextResponse.json({ error: "Kategori OPD wajib dipilih" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);

  // Cari sheet yang namanya mengandung 'master' atau 'clean_datamaster', fallback ke sheet pertama
  const sheet =
    workbook.worksheets.find((ws) => /master|clean_datamaster/i.test(ws.name)) ?? workbook.worksheets[0];

  if (!sheet) return NextResponse.json({ error: "Sheet tidak ditemukan di file" }, { status: 400 });

  // Baca header row (row pertama yang tidak kosong)
  const headerRow = sheet.getRow(1);
  const colIndexToField: Record<number, string> = {};
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = cellToString(cell.value).toLowerCase();
    if (HEADER_MAP[key]) colIndexToField[colNumber] = HEADER_MAP[key];
  });

  if (Object.keys(colIndexToField).length === 0) {
    return NextResponse.json(
      { error: "Header kolom tidak dikenali. Pastikan file sesuai format clean_datamaster_smd." },
      { status: 400 }
    );
  }

  // ---- Baca seluruh baris data ke memori ----
  type Row = Record<string, any>;
  const rows: Row[] = [];

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const rec: Row = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const field = colIndexToField[colNumber];
      if (field) rec[field] = cell.value;
    });
    if (rec.nomor_polisi) rows.push(rec);
  });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Tidak ada baris data terbaca dari file" }, { status: 400 });
  }

  // ---- Normalisasi tiap baris ----
  const parsed = rows.map((r) => {
    const nomorPolisiRaw = cellToString(r.nomor_polisi);
    // Prioritas: pakai kolom "Cleaned" (nopol yg sudah dirapikan dari pipeline kamu).
    // Ini dipakai baik sebagai tampilan (nomor_polisi_display) MAUPUN kunci pencocokan.
    const nopolCleaned = cellToString(r.nopol_cleaned);
    const nomorPolisiSumber = nopolCleaned || nomorPolisiRaw;
    const nomorPolisi = normalizeNopol(nomorPolisiSumber);
    const namaInstansi = cellToString(r.standardized_instansi) || cellToString(r.instansi);
    const jumlahPkb = cellToNumber(r.jumlah_pkb);
    const beaPkbPok = cellToNumber(r.bea_pkb_pok);
    return {
      nomor_polisi: nomorPolisi,
      nomor_polisi_display: nomorPolisiSumber,
      nama_pemilik: toProperCase(cellToString(r.nama_pemilik)),
      nama_instansi: namaInstansi,
      jenis: cellToString(r.jenis_kendaraan) || null,
      merk: cellToString(r.merk) || null,
      model: cellToString(r.model) || null,
      tahun: r.tahun ? Number(cellToNumber(r.tahun)) : null,
      jatuh_tempo: cellToDateString(r.tanggal_jatuh_tempo) ?? cellToDateString(r.tg_akhir_pkb),
      plat: platFromNopol(nomorPolisi),
      // aturan: pakai Jumlah PKB kalau terisi, kalau kosong pakai bea_pkb_pok
      pokok_pkb: jumlahPkb ?? beaPkbPok,
      tanggal_bayar: cellToDateString(r.tg_bayar),
    };
  }).filter((r) => r.nomor_polisi);

  // ---- 1. Resolve OPD: fetch existing dalam kategori ini, buat yang belum ada ----
  const namaInstansiUnik = Array.from(new Set(parsed.map((r) => r.nama_instansi).filter(Boolean)));

  const { data: opdExisting } = await supabase
    .from("opd")
    .select("id, nama_opd")
    .eq("kategori", kategori);

  const opdMap = new Map<string, string>(); // nama lowercase trim -> id
  (opdExisting ?? []).forEach((o) => opdMap.set(o.nama_opd.trim().toLowerCase(), o.id));

  const opdBaru = namaInstansiUnik.filter((nama) => !opdMap.has(nama.trim().toLowerCase()));

  if (opdBaru.length > 0) {
    const { data: inserted } = await supabase
      .from("opd")
      .insert(opdBaru.map((nama) => ({ nama_opd: nama, kategori, perlu_verifikasi: true })))
      .select("id, nama_opd");
    (inserted ?? []).forEach((o) => opdMap.set(o.nama_opd.trim().toLowerCase(), o.id));
  }

  // ---- 2. Cek kendaraan yang SUDAH ada — id-nya, opd, DAN tanggal bayar terakhir yang tersimpan ----
  const nopolList = parsed.map((r) => r.nomor_polisi);
  const existingKendaraan = new Map<string, { id: string; opd_id: string }>();

  const CHUNK = 500;
  for (let i = 0; i < nopolList.length; i += CHUNK) {
    const chunk = nopolList.slice(i, i + CHUNK);
    const { data } = await supabase.from("kendaraan").select("id, nomor_polisi, opd_id").in("nomor_polisi", chunk);
    (data ?? []).forEach((k) => existingKendaraan.set(k.nomor_polisi, { id: k.id, opd_id: k.opd_id }));
  }

  const jumlahDitambah = parsed.filter((r) => !existingKendaraan.has(r.nomor_polisi)).length;
  const jumlahDiupdate = parsed.length - jumlahDitambah;

  // ---- 3. Upsert kendaraan (status TIDAK disertakan supaya tidak menimpa status manual) ----
  const kendaraanPayload = parsed.map((r) => ({
    nomor_polisi: r.nomor_polisi,
    nomor_polisi_display: r.nomor_polisi_display,
    opd_id: opdMap.get(r.nama_instansi?.trim().toLowerCase() ?? "") ?? null,
    plat: r.plat,
    nama_pemilik: r.nama_pemilik,
    jenis: r.jenis,
    merk: r.merk,
    model: r.model,
    tahun: r.tahun,
    jatuh_tempo: r.plat === "KT" ? r.jatuh_tempo : null,
  }));

  for (let i = 0; i < kendaraanPayload.length; i += CHUNK) {
    const chunk = kendaraanPayload.slice(i, i + CHUNK);
    await supabase.from("kendaraan").upsert(chunk, { onConflict: "nomor_polisi" });
  }

  // ---- 4. Sinkronkan pembayaran — cek SEMUA baris (bukan cuma kendaraan baru).
  //     Kalau tanggal_bayar di file beda dari tanggal bayar terakhir yang tersimpan
  //     (atau belum pernah ada transaksi sama sekali), catat sebagai pembayaran baru.
  //     Opsen otomatis dihitung 66% x pokok oleh trigger database saat insert.
  const { data: kendaraanIdRows } = await (async () => {
    const out: { id: string; nomor_polisi: string }[] = [];
    for (let i = 0; i < nopolList.length; i += CHUNK) {
      const { data } = await supabase
        .from("kendaraan")
        .select("id, nomor_polisi")
        .in("nomor_polisi", nopolList.slice(i, i + CHUNK));
      out.push(...(data ?? []));
    }
    return { data: out };
  })();
  const idByNopol = new Map((kendaraanIdRows ?? []).map((k) => [k.nomor_polisi, k.id]));

  const kendaraanIdsAll = Array.from(idByNopol.values());
  const pembayaranTerakhirMap = new Map<string, string>(); // kendaraan_id -> tanggal_bayar_terakhir
  for (let i = 0; i < kendaraanIdsAll.length; i += CHUNK) {
    const { data } = await supabase
      .from("v_kendaraan_pembayaran_terakhir")
      .select("kendaraan_id, tanggal_bayar_terakhir")
      .in("kendaraan_id", kendaraanIdsAll.slice(i, i + CHUNK));
    (data ?? []).forEach((p) => {
      if (p.tanggal_bayar_terakhir) pembayaranTerakhirMap.set(p.kendaraan_id, p.tanggal_bayar_terakhir);
    });
  }

  const transaksiPayload = parsed
    .filter((r) => r.tanggal_bayar && r.pokok_pkb && idByNopol.has(r.nomor_polisi))
    .filter((r) => {
      const kendaraanId = idByNopol.get(r.nomor_polisi)!;
      const terakhir = pembayaranTerakhirMap.get(kendaraanId);
      return terakhir !== r.tanggal_bayar; // beda tanggal (atau belum pernah ada) -> catat baru
    })
    .map((r) => ({
      kendaraan_id: idByNopol.get(r.nomor_polisi),
      tanggal_bayar: r.tanggal_bayar,
      masa_pajak_periode: r.jatuh_tempo,
      pokok_pkb: r.pokok_pkb,
      // opsen & total otomatis dihitung trigger fn_calc_opsen_total
    }));

  for (let i = 0; i < transaksiPayload.length; i += CHUNK) {
    await supabase.from("transaksi_pembayaran").insert(transaksiPayload.slice(i, i + CHUNK));
  }

  const jumlahPembayaranBaru = transaksiPayload.length;

  // ---- 5. Tandai Non-aktif kendaraan yang hilang dari data terbaru (dalam scope kategori ini) ----
  const opdIdsScope = Array.from(opdMap.values());
  const { data: kendaraanAktifScope } = await supabase
    .from("kendaraan")
    .select("id, nomor_polisi, opd_id")
    .in("opd_id", opdIdsScope.length > 0 ? opdIdsScope : ["00000000-0000-0000-0000-000000000000"])
    .eq("status", "Aktif");

  const nopolSet = new Set(nopolList);
  const hilang = (kendaraanAktifScope ?? []).filter((k) => !nopolSet.has(k.nomor_polisi));

  if (hilang.length > 0) {
    const riwayatPayload = hilang.map((k) => ({
      kendaraan_id: k.id,
      status_baru: "Non-aktif" as const,
      keterangan: "Tidak ditemukan pada import Database Master terbaru",
      sumber: "Import Database Master" as const,
      created_by: user.email,
    }));
    for (let i = 0; i < riwayatPayload.length; i += CHUNK) {
      await supabase.from("riwayat_status").insert(riwayatPayload.slice(i, i + CHUNK));
    }
  }

  // ---- 6. Catat import_log & activity_log ----
  const { data: log } = await supabase
    .from("import_log")
    .insert({
      jenis_import: "Database Master",
      nama_file: file.name,
      jumlah_ditambah: jumlahDitambah,
      jumlah_diupdate: jumlahDiupdate,
      jumlah_nonaktif: hilang.length,
      created_by: user.email,
    })
    .select()
    .single();

  await supabase.from("activity_log").insert({
    jenis_aksi: "import_database_master",
    deskripsi: `Import Database Master (${kategori}): ${jumlahDitambah} ditambah, ${jumlahDiupdate} diperbarui, ${jumlahPembayaranBaru} pembayaran baru tercatat, ${hilang.length} ditandai non-aktif. OPD baru: ${opdBaru.length}.`,
    referensi_id: log?.id,
    referensi_tabel: "import_log",
    created_by: user.email,
  });

  return NextResponse.redirect(
    new URL(
      `/import?sukses=master&ditambah=${jumlahDitambah}&diupdate=${jumlahDiupdate}&bayar_baru=${jumlahPembayaranBaru}&nonaktif=${hilang.length}&opd_baru=${opdBaru.length}`,
      req.url
    ),
    { status: 303 }
  );
}
