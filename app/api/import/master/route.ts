import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol, platFromNopol } from "@/lib/nopol";
import { cellToDateString, cellToNumber, cellToString } from "@/lib/excel-helpers";
import { toProperCase } from "@/lib/text-clean";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Import Database Master — file dibaca di browser dan dikirim per potongan (± 1000 baris),
// supaya tidak kena batas ukuran unggahan & batas waktu Netlify.
//   body { kategori, rows }                                -> proses satu potongan
//   body { selesai: true, kategori, nopol, nama_file, total } -> tandai non-aktif yang hilang + catat log

const KATEGORI = ["Pemerintah Provinsi Kalimantan Timur", "Pemerintah Kota Samarinda"];
const KUNCI = 150;
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
  const kategori: string = body.kategori;
  if (!KATEGORI.includes(kategori)) return NextResponse.json({ error: "Kategori OPD wajib dipilih" }, { status: 400 });

  // ---------------- penutup ----------------
  if (body.selesai) {
    const total = body.total ?? {};
    const nopolSet = new Set<string>((Array.isArray(body.nopol) ? body.nopol : []).map((x: string) => normalizeNopol(x)));

    const { data: opdKategori } = await supabase.from("opd").select("id").eq("kategori", kategori);
    const opdIds = (opdKategori ?? []).map((o: any) => o.id);
    const aktif: { id: string; nomor_polisi: string }[] = [];
    for (const p of potong(opdIds, 50)) {
      let dari = 0;
      while (true) {
        const { data } = await supabase.from("kendaraan").select("id, nomor_polisi").in("opd_id", p).eq("status", "Aktif").range(dari, dari + 999);
        aktif.push(...(data ?? []));
        if (!data || data.length < 1000) break;
        dari += 1000;
      }
    }
    // pengaman: bila daftar nopol kosong, jangan menandai siapa pun non-aktif
    const hilang = nopolSet.size === 0 ? [] : aktif.filter((k) => !nopolSet.has(k.nomor_polisi));
    for (const p of potong(hilang, 500)) {
      await supabase.from("riwayat_status").insert(
        p.map((k) => ({
          kendaraan_id: k.id,
          status_baru: "Non-aktif" as const,
          keterangan: "Tidak ditemukan pada import Database Master terbaru",
          sumber: "Import Database Master" as const,
          created_by: user.email,
        }))
      );
    }
    const { data: log } = await supabase
      .from("import_log")
      .insert({
        jenis_import: "Database Master",
        nama_file: String(body.nama_file ?? "").slice(0, 500),
        jumlah_ditambah: Number(total.ditambah ?? 0),
        jumlah_diupdate: Number(total.diupdate ?? 0),
        jumlah_nonaktif: hilang.length,
        created_by: user.email,
      })
      .select()
      .single();
    await supabase.from("activity_log").insert({
      jenis_aksi: "import_database_master",
      deskripsi: `Import Database Master (${kategori}): ${total.ditambah ?? 0} ditambah, ${total.diupdate ?? 0} diperbarui, ${total.bayar_baru ?? 0} pembayaran baru tercatat, ${hilang.length} ditandai non-aktif. OPD baru: ${total.opd_baru ?? 0}.`,
      referensi_id: log?.id,
      referensi_tabel: "import_log",
      created_by: user.email,
    });
    return NextResponse.json({ ok: true, nonaktif: hilang.length });
  }

  // ---------------- satu potongan ----------------
  const rows: Record<string, any>[] = Array.isArray(body.rows) ? body.rows : [];
  const parsed = rows
    .map((r) => {
      const nomorPolisiRaw = cellToString(r.nomor_polisi);
      const nopolCleaned = cellToString(r.nopol_cleaned);
      const sumber = nopolCleaned || nomorPolisiRaw;
      const nomorPolisi = normalizeNopol(sumber);
      const jumlahPkb = cellToNumber(r.jumlah_pkb);
      const beaPkbPok = cellToNumber(r.bea_pkb_pok);
      const cc = r.cc !== undefined && r.cc !== null && r.cc !== "" ? cellToNumber(r.cc) : null;
      return {
        nomor_polisi: nomorPolisi,
        nomor_polisi_display: sumber,
        nama_pemilik: toProperCase(cellToString(r.nama_pemilik)),
        nama_instansi: cellToString(r.standardized_instansi) || cellToString(r.instansi),
        jenis: cellToString(r.jenis_kendaraan) || null,
        merk: cellToString(r.merk) || null,
        model: cellToString(r.model) || null,
        tahun: r.tahun ? Number(cellToNumber(r.tahun)) : null,
        kode_merk: cellToString(r.kode_merk) || null,
        tanggal_awal_stnk: cellToDateString(r.tanggal_awal_stnk),
        kode_jenis: cellToString(r.kode_jenis).toUpperCase() || null,
        cc: cc !== null && !Number.isNaN(cc) ? Math.round(cc) : null,
        kd_plat: cellToString(r.kd_plat) || null,
        no_rangka: cellToString(r.no_rangka) || null,
        jatuh_tempo: cellToDateString(r.tanggal_jatuh_tempo) ?? cellToDateString(r.tg_akhir_pkb),
        plat: platFromNopol(nomorPolisi),
        pokok_pkb: jumlahPkb ?? beaPkbPok,
        tanggal_bayar: cellToDateString(r.tg_bayar),
      };
    })
    .filter((r) => r.nomor_polisi);

  // 1. OPD
  const namaUnik = Array.from(new Set(parsed.map((r) => r.nama_instansi).filter(Boolean)));
  const { data: opdAda } = await supabase.from("opd").select("id, nama_opd").eq("kategori", kategori);
  const opdMap = new Map<string, string>();
  (opdAda ?? []).forEach((o: any) => opdMap.set(o.nama_opd.trim().toLowerCase(), o.id));
  const opdBaru = namaUnik.filter((n) => !opdMap.has(n.trim().toLowerCase()));
  if (opdBaru.length > 0) {
    const { data: ins, error } = await supabase
      .from("opd")
      .insert(opdBaru.map((nama) => ({ nama_opd: nama, kategori, perlu_verifikasi: true })))
      .select("id, nama_opd");
    if (error) return NextResponse.json({ error: `Gagal membuat OPD baru: ${error.message}` }, { status: 500 });
    (ins ?? []).forEach((o: any) => opdMap.set(o.nama_opd.trim().toLowerCase(), o.id));
  }

  // 2. kendaraan yang sudah ada
  const nopolList = Array.from(new Set(parsed.map((r) => r.nomor_polisi)));
  const ada = new Set<string>();
  const hasilAda = await Promise.all(potong(nopolList, KUNCI).map((p) => supabase.from("kendaraan").select("nomor_polisi").in("nomor_polisi", p)));
  hasilAda.forEach((h) => (h.data ?? []).forEach((k: any) => ada.add(k.nomor_polisi)));

  // 3. upsert kendaraan (status tidak disertakan agar status manual tidak tertimpa).
  //    Kolom opsional hanya ikut bila terisi; baris dikelompokkan menurut kolom yang dikirim.
  const unik = new Map<string, (typeof parsed)[number]>();
  parsed.forEach((r) => unik.set(r.nomor_polisi, r));
  const dilewatiTanpaInstansi: string[] = [];
  const payload: Record<string, any>[] = [];
  unik.forEach((r) => {
    const opdId = opdMap.get(r.nama_instansi.trim().toLowerCase());
    if (!opdId) {
      dilewatiTanpaInstansi.push(r.nomor_polisi);
      return;
    }
    payload.push({
      nomor_polisi: r.nomor_polisi,
      nomor_polisi_display: r.nomor_polisi_display,
      opd_id: opdId,
      plat: r.plat,
      nama_pemilik: r.nama_pemilik,
      jenis: r.jenis,
      merk: r.merk,
      model: r.model,
      tahun: r.tahun,
      kode_merk: r.kode_merk,
      tanggal_awal_stnk: r.tanggal_awal_stnk,
      kode_jenis: r.kode_jenis,
      cc: r.cc,
      kd_plat: r.kd_plat,
      no_rangka: r.no_rangka,
      jatuh_tempo: r.plat === "KT" ? r.jatuh_tempo : null,
    });
  });
  const OPSIONAL = ["kode_merk", "tanggal_awal_stnk", "kode_jenis", "cc", "kd_plat", "no_rangka"] as const;
  const kelompok = new Map<string, Record<string, any>[]>();
  for (const row of payload) {
    const r: Record<string, any> = { ...row };
    for (const k of OPSIONAL) if (r[k] === null || r[k] === undefined) delete r[k];
    const sig = OPSIONAL.filter((k) => k in r).join(",");
    if (!kelompok.has(sig)) kelompok.set(sig, []);
    kelompok.get(sig)!.push(r);
  }
  for (const rowsK of kelompok.values()) {
    for (const p of potong(rowsK, 300)) {
      const { error } = await supabase.from("kendaraan").upsert(p, { onConflict: "nomor_polisi" });
      if (error) return NextResponse.json({ error: `Gagal menyimpan kendaraan: ${error.message}` }, { status: 500 });
    }
  }

  // 4. pembayaran
  const idByNopol = new Map<string, string>();
  const hasilId = await Promise.all(potong(nopolList, KUNCI).map((p) => supabase.from("kendaraan").select("id, nomor_polisi").in("nomor_polisi", p)));
  hasilId.forEach((h) => (h.data ?? []).forEach((k: any) => idByNopol.set(k.nomor_polisi, k.id)));
  const terakhir = new Map<string, string>();
  const hasilTerakhir = await Promise.all(
    potong(Array.from(idByNopol.values()), KUNCI).map((p) => supabase.from("v_kendaraan_pembayaran_terakhir").select("kendaraan_id, tanggal_bayar_terakhir").in("kendaraan_id", p))
  );
  hasilTerakhir.forEach((h) => (h.data ?? []).forEach((p: any) => p.tanggal_bayar_terakhir && terakhir.set(p.kendaraan_id, p.tanggal_bayar_terakhir)));

  const transaksi = Array.from(unik.values())
    .filter((r) => r.tanggal_bayar && r.pokok_pkb && idByNopol.has(r.nomor_polisi))
    .filter((r) => terakhir.get(idByNopol.get(r.nomor_polisi)!) !== r.tanggal_bayar)
    .map((r) => ({
      kendaraan_id: idByNopol.get(r.nomor_polisi),
      tanggal_bayar: r.tanggal_bayar,
      masa_pajak_periode: r.jatuh_tempo,
      pokok_pkb: r.pokok_pkb, // opsen & total dihitung trigger fn_calc_opsen_total
    }));
  for (const p of potong(transaksi, 500)) {
    const { error } = await supabase.from("transaksi_pembayaran").insert(p);
    if (error) return NextResponse.json({ error: `Gagal menyimpan pembayaran: ${error.message}` }, { status: 500 });
  }

  const ditambah = Array.from(unik.keys()).filter((n) => !ada.has(n) && !dilewatiTanpaInstansi.includes(n)).length;
  return NextResponse.json({
    ok: true,
    ditambah,
    diupdate: payload.length - ditambah,
    bayar_baru: transaksi.length,
    opd_baru: opdBaru.length,
    tanpa_instansi: dilewatiTanpaInstansi.length,
  });
}
