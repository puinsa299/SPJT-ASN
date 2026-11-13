import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol } from "@/lib/nopol";
import { BarisHasilCek, KendaraanRingkas, TransaksiRingkas, jatuhTempoAkhir, rencanakan } from "@/lib/import/hasil-cek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Import Hasil Cek SPJT/STPD — file dibaca di browser, dikirim per potongan (± 400 baris).
//   body { mode: "rencana", rows, opsi }                 -> pratinjau, TIDAK mengubah data
//   body { mode: "terapkan", rows, opsi, nama_file }     -> hitung ulang dari data terkini lalu simpan
//   body { mode: "selesai", nama_file, total }           -> catat import_log & activity_log (satu kali)

const KUNCI = 150;
const potong = <T,>(a: T[], n: number) => {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
};
const hariIniWita = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" }); // yyyy-mm-dd

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
  const namaFile = String(body.nama_file ?? "").slice(0, 300);

  // ---------- penutup: satu entri log ----------
  if (body.mode === "selesai") {
    const t = body.total ?? {};
    await supabase.from("import_log").insert({
      jenis_import: "Hasil Cek",
      nama_file: namaFile,
      jumlah_ditambah: Number(t.realisasi ?? 0),
      jumlah_diupdate: Number(t.jatuh_tempo ?? 0),
      jumlah_diabaikan: Number(t.dilewati ?? 0),
      created_by: user.email,
    });
    await supabase.from("activity_log").insert({
      jenis_aksi: "import_hasil_cek",
      deskripsi: `Import Hasil Cek (${namaFile}): ${t.realisasi ?? 0} realisasi dicatat, ${t.kendaraan ?? 0} kendaraan diperbarui, ${t.jatuh_tempo ?? 0} jatuh tempo diubah, ${t.dilewati ?? 0} baris dilewati.`.slice(0, 1000),
      created_by: user.email,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.mode !== "rencana" && body.mode !== "terapkan") return NextResponse.json({ error: "Mode tidak dikenal" }, { status: 400 });
  const rows: BarisHasilCek[] = Array.isArray(body.rows) ? body.rows : [];
  const opsi = { realisasi: body.opsi?.realisasi !== false, jatuhTempo: body.opsi?.jatuhTempo !== false };

  // ---- data terkini: kendaraan cocok + transaksi mereka ----
  const nopolList = Array.from(new Set(rows.map((r) => normalizeNopol(r.nopol)).filter(Boolean)));
  const hk = await Promise.all(
    potong(nopolList, KUNCI).map((p) =>
      supabase.from("kendaraan").select("id, nomor_polisi, nomor_polisi_display, nama_pemilik, nama_pengguna, jatuh_tempo, plat, status").in("nomor_polisi", p)
    )
  );
  const gk = hk.find((h) => h.error);
  if (gk?.error) return NextResponse.json({ error: `Gagal membaca data kendaraan: ${gk.error.message}` }, { status: 500 });
  const kendaraan = new Map<string, KendaraanRingkas>();
  hk.forEach((h) => (h.data ?? []).forEach((k: any) => kendaraan.set(k.nomor_polisi, k as KendaraanRingkas)));

  const ids = Array.from(kendaraan.values()).map((k) => k.id);
  const ht = await Promise.all(
    potong(ids, KUNCI).map((p) => supabase.from("transaksi_pembayaran").select("kendaraan_id, tanggal_bayar, sumber").in("kendaraan_id", p))
  );
  const gt = ht.find((h) => h.error);
  if (gt?.error) return NextResponse.json({ error: `Gagal membaca transaksi: ${gt.error.message}` }, { status: 500 });
  const transaksi: TransaksiRingkas[] = ht.flatMap((h) => (h.data ?? []) as TransaksiRingkas[]);

  const rencana = rencanakan(rows, kendaraan, transaksi, opsi, hariIniWita());

  if (body.mode === "rencana") {
    return NextResponse.json({
      ok: true,
      perStatus: rencana.perStatus,
      jumlahRealisasi: rencana.realisasi.length,
      jumlahUbahJatuhTempo: rencana.ubahJatuhTempo.length,
      jumlahMundur: rencana.ubahJatuhTempo.filter((u) => u.mundur).length,
      sudahTercatat: rencana.sudahTercatat,
      dilewati: rencana.dilewati,
      contohRealisasi: rencana.realisasi.slice(0, 40),
      contohJatuhTempo: rencana.ubahJatuhTempo.slice(0, 40),
    });
  }

  // ---- terapkan ----
  const sumber = `Hasil Cek SPJT (${namaFile})`.slice(0, 400);
  for (const p of potong(
    rencana.realisasi.map((r) => ({ kendaraan_id: r.kendaraan_id, tanggal_bayar: r.tanggal_bayar, masa_pajak_periode: r.masa_akhir, sumber })),
    500
  )) {
    const { error } = await supabase.from("transaksi_pembayaran").insert(p);
    if (error) return NextResponse.json({ error: `Gagal menyimpan realisasi: ${error.message}` }, { status: 500 });
  }

  const jt = Array.from(jatuhTempoAkhir(rencana.ubahJatuhTempo));
  for (const grup of potong(jt, 20)) {
    const hasil = await Promise.all(grup.map(([id, baru]) => supabase.from("kendaraan").update({ jatuh_tempo: baru }).eq("id", id)));
    const g = hasil.find((h) => h.error);
    if (g?.error) return NextResponse.json({ error: `Gagal memperbarui jatuh tempo: ${g.error.message}` }, { status: 500 });
  }

  const diperbarui = new Set([...rencana.realisasi.map((r) => r.kendaraan_id), ...jt.map(([id]) => id)]);
  return NextResponse.json({
    ok: true,
    perStatus: rencana.perStatus,
    realisasi: rencana.realisasi.length,
    jatuhTempo: jt.length,
    kendaraan: diperbarui.size,
    sudahTercatat: rencana.sudahTercatat,
    dilewati: rencana.dilewati,
  });
}
