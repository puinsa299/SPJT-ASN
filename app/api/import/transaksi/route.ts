import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol } from "@/lib/nopol";
import { cellToDateString, cellToNumber, cellToString } from "@/lib/excel-helpers";
import { toProperCase } from "@/lib/text-clean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Import transaksi bulanan — file dibaca di browser lalu dikirim per potongan (± 1000 baris),
// supaya tidak kena batas ukuran unggahan & batas waktu Netlify. Satu panggilan = satu potongan.
//   body { rows: [...] }                       -> proses satu potongan, balas hitungannya
//   body { selesai: true, nama_file, total }   -> catat import_log & activity_log

const KUNCI = 150; // jumlah id/nopol per query (supaya URL tidak kepanjangan)

const potong = <T,>(a: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi login habis, silakan login ulang" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Data tidak terbaca" }, { status: 400 });
  }

  // ---------- penutup: catat log ----------
  if (body.selesai) {
    const t = body.total ?? {};
    await supabase.from("import_log").insert({
      jenis_import: "Transaksi Bulanan",
      nama_file: String(body.nama_file ?? "").slice(0, 500),
      jumlah_diupdate: Number(t.bayar_baru ?? 0),
      jumlah_diabaikan: Number(t.diabaikan ?? 0),
      created_by: user.email,
    });
    await supabase.from("activity_log").insert({
      jenis_aksi: "import_transaksi_bulanan",
      deskripsi: `Import Transaksi Bulanan (${String(body.nama_file ?? "")}): ${t.bayar_baru ?? 0} pembayaran baru tercatat dari ${t.dicocokkan ?? 0} nopol cocok, ${t.diabaikan ?? 0} nopol diabaikan, ${t.belum_balik_nama ?? 0} kendaraan terdeteksi belum balik nama.`.slice(0, 1000),
      created_by: user.email,
    });
    return NextResponse.json({ ok: true });
  }

  // ---------- satu potongan ----------
  const rawRows: Record<string, any>[] = Array.isArray(body.rows) ? body.rows : [];
  const parsed = rawRows
    .map((r) => ({
      nomor_polisi: normalizeNopol(cellToString(r.nomor_polisi)),
      nama_pemilik_file: toProperCase(cellToString(r.nm_pemilik)),
      tanggal_bayar: cellToDateString(r.tgl_bayar),
      masa_pajak_periode: cellToDateString(r.tgl_akhir_pkb),
      pokok_pkb: cellToNumber(r.pkb_pokok),
      opsen: cellToNumber(r.pkb_opsen_pok),
      swdkllj: cellToNumber(r.bea_swdkllj_pok),
      kode_jenis: cellToString(r.kd_jenis_kb).toUpperCase() || null,
      cc: cellToNumber(r.jumlah_cc),
      kd_plat: cellToString(r.kd_plat) || null,
      no_rangka: cellToString(r.no_chasis) || null,
      kode_merk: cellToString(r.kd_merek_kb) || null,
      tanggal_awal_stnk: cellToDateString(r.tg_awal_stnk),
    }))
    .filter((r) => r.nomor_polisi && r.tanggal_bayar);

  // 1. kendaraan yang cocok (hanya nopol di potongan ini, ambil seluruh kolom supaya upsert aman)
  const daftarNopol = Array.from(new Set(parsed.map((r) => r.nomor_polisi)));
  const hasilKendaraan = await Promise.all(
    potong(daftarNopol, KUNCI).map((p) => supabase.from("kendaraan").select("*").in("nomor_polisi", p))
  );
  const galatK = hasilKendaraan.find((h) => h.error);
  if (galatK?.error) return NextResponse.json({ error: `Gagal membaca data kendaraan: ${galatK.error.message}` }, { status: 500 });
  const kendaraanMap = new Map<string, Record<string, any>>();
  hasilKendaraan.forEach((h) => (h.data ?? []).forEach((k: any) => kendaraanMap.set(k.nomor_polisi, k)));

  const cocok = parsed.filter((r) => kendaraanMap.has(r.nomor_polisi));
  const diabaikan = parsed.length - cocok.length;
  if (cocok.length === 0) return NextResponse.json({ ok: true, dicocokkan: 0, diabaikan, bayar_baru: 0, belum_balik_nama: 0 });

  // 2. pembayaran terakhir tersimpan -> hindari duplikat
  const ids = Array.from(new Set(cocok.map((r) => kendaraanMap.get(r.nomor_polisi)!.id as string)));
  const terakhirMap = new Map<string, string>();
  const hasilTerakhir = await Promise.all(
    potong(ids, KUNCI).map((p) => supabase.from("v_kendaraan_pembayaran_terakhir").select("kendaraan_id, tanggal_bayar_terakhir").in("kendaraan_id", p))
  );
  hasilTerakhir.forEach((h) => (h.data ?? []).forEach((p: any) => p.tanggal_bayar_terakhir && terakhirMap.set(p.kendaraan_id, p.tanggal_bayar_terakhir)));

  const barisBaru = cocok.filter((r) => terakhirMap.get(kendaraanMap.get(r.nomor_polisi)!.id) !== r.tanggal_bayar);
  const transaksiPayload = barisBaru.map((r) => ({
    kendaraan_id: kendaraanMap.get(r.nomor_polisi)!.id,
    tanggal_bayar: r.tanggal_bayar,
    masa_pajak_periode: r.masa_pajak_periode,
    pokok_pkb: r.pokok_pkb,
    opsen: r.opsen,
    swdkllj: r.swdkllj,
  }));
  for (const p of potong(transaksiPayload, 500)) {
    const { error } = await supabase.from("transaksi_pembayaran").insert(p);
    if (error) return NextResponse.json({ error: `Gagal menyimpan pembayaran: ${error.message}` }, { status: 500 });
  }

  // 3. perbarui data kendaraan. Per kendaraan dipakai baris dengan masa pajak (akhir PKB) PALING BARU.
  const terbaru = new Map<string, (typeof cocok)[number]>();
  for (const r of cocok) {
    const lama = terbaru.get(r.nomor_polisi);
    if (!lama || (r.masa_pajak_periode ?? "") > (lama.masa_pajak_periode ?? "")) terbaru.set(r.nomor_polisi, r);
  }

  let belumBalikNama = 0;
  const kendaraanPayload: Record<string, any>[] = [];
  terbaru.forEach((r, nopol) => {
    const info = kendaraanMap.get(nopol)!;
    const u: Record<string, any> = { ...info }; // baris lengkap -> tidak ada kolom yang terhapus
    let ubah = false;
    if (r.masa_pajak_periode) { u.jatuh_tempo = r.masa_pajak_periode; ubah = true; }
    if (r.kode_jenis) { u.kode_jenis = r.kode_jenis; ubah = true; }
    if (r.cc !== null && !Number.isNaN(Number(r.cc))) { u.cc = Math.round(Number(r.cc)); ubah = true; }
    if (r.kd_plat) { u.kd_plat = r.kd_plat; ubah = true; }
    if (r.no_rangka) { u.no_rangka = r.no_rangka; ubah = true; }
    if (r.kode_merk && !info.kode_merk) { u.kode_merk = r.kode_merk; ubah = true; }
    if (r.tanggal_awal_stnk) { u.tanggal_awal_stnk = r.tanggal_awal_stnk; ubah = true; }
    if (r.nama_pemilik_file) {
      const tersimpan = (info.nama_pemilik ?? "").trim().toLowerCase();
      const dariFile = r.nama_pemilik_file.trim().toLowerCase();
      const belum = tersimpan !== "" && tersimpan !== dariFile;
      u.belum_balik_nama = belum;
      u.nama_pemilik_transaksi = belum ? r.nama_pemilik_file : null;
      if (belum) belumBalikNama += 1;
      ubah = true;
    }
    // plat Non-KT tidak boleh punya jatuh tempo (aturan tabel)
    if (u.plat !== "KT") u.jatuh_tempo = null;
    if (ubah) kendaraanPayload.push(u);
  });
  for (const p of potong(kendaraanPayload, 300)) {
    const { error } = await supabase.from("kendaraan").upsert(p, { onConflict: "id" });
    if (error) return NextResponse.json({ error: `Gagal memperbarui kendaraan: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    dicocokkan: cocok.length,
    diabaikan,
    bayar_baru: transaksiPayload.length,
    belum_balik_nama: belumBalikNama,
  });
}
