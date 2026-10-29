import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buatDocx } from "@/lib/surat/docx";
import { buatPdf, hitungLembarLampiran } from "@/lib/surat/pdf";
import {
  BarisLampiran,
  InfoPemutihan,
  JenisSurat,
  SuratData,
  gabungSetelan,
  namaBerkas,
} from "@/lib/surat/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const n = (v: unknown) => Number(v ?? 0) || 0;

// supabase-js memuat filter .in() di URL, jadi daftar id dipecah per 100
async function perPotongan<T>(ids: string[], ambil: (potong: string[]) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await ambil(ids.slice(i, i + 100));
    if (data) hasil.push(...data);
  }
  return hasil;
}

export async function POST(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const opdId = q.get("opd_id");
  const jenis: JenisSurat = q.get("jenis")?.toUpperCase() === "STPD" ? "STPD" : "SPJT";
  const format = q.get("format")?.toLowerCase() === "pdf" ? "pdf" : "docx";
  if (!opdId) return NextResponse.json({ error: "opd_id wajib diisi" }, { status: 400 });

  const supabase = createClient();

  const [{ data: opd }, { data: setelanRow }, { data: statusRows }, { data: programAktif }] = await Promise.all([
    supabase.from("opd").select("id, nama_opd").eq("id", opdId).single(),
    supabase.from("pengaturan_surat").select("*").eq("jenis", jenis).maybeSingle(),
    supabase.from("v_kendaraan_status").select("kendaraan_id, masuk_periode_spjt").eq("opd_id", opdId),
    supabase.from("v_pemutihan_aktif").select("nama, tanggal_mulai, tanggal_selesai").maybeSingle(),
  ]);
  if (!opd) return NextResponse.json({ error: "Instansi tidak ditemukan" }, { status: 404 });

  const semuaId = (statusRows ?? []).map((r) => r.kendaraan_id as string);
  const tagihanAll = await perPotongan(semuaId, (p) => supabase.from("v_tagihan_pkb").select("*").in("kendaraan_id", p));
  const tagihanMap = new Map(tagihanAll.map((t) => [t.kendaraan_id as string, t]));

  // SPJT: kendaraan yang masuk periode SPJT. STPD: kendaraan yang sudah menunggak (>= 1 tahun).
  const terpilih =
    jenis === "SPJT"
      ? (statusRows ?? []).filter((r) => r.masuk_periode_spjt).map((r) => r.kendaraan_id as string)
      : semuaId.filter((id) => n(tagihanMap.get(id)?.tahun_menunggak) >= 1);

  if (terpilih.length === 0) {
    return NextResponse.json(
      { error: jenis === "SPJT" ? "Tidak ada kendaraan yang masuk periode SPJT untuk instansi ini" : "Tidak ada kendaraan yang menunggak untuk instansi ini" },
      { status: 400 }
    );
  }

  const kendaraan = await perPotongan(terpilih, (p) =>
    supabase
      .from("kendaraan")
      .select("id, nomor_polisi_display, nama_pemilik, nama_pemilik_transaksi, no_rangka, jatuh_tempo")
      .in("id", p)
  );

  const pemutihanAktif = !!programAktif;
  let totalPotongan = 0;
  const baris: BarisLampiran[] = kendaraan.map((k) => {
    const t = tagihanMap.get(k.id);
    const pakai = pemutihanAktif && t?.pemutihan_aktif;
    const v = (normal: string, setelah: string) => n(t?.[pakai ? setelah : normal]);
    totalPotongan += n(t?.total_potongan_pemutihan);
    return {
      nopol: k.nomor_polisi_display ?? "",
      nama: k.nama_pemilik_transaksi || k.nama_pemilik || "",
      rangka: k.no_rangka ?? "",
      jatuhTempo: k.jatuh_tempo ?? null,
      pokok: v("total_pokok_pkb", "p_pokok_pkb"),
      dendaPkb: v("total_denda_pkb", "p_denda_pkb"),
      sanksi: v("total_sanksi_adm", "p_sanksi_adm"),
      opsen: v("total_opsen", "p_opsen"),
      dendaOpsen: v("total_denda_opsen", "p_denda_opsen"),
      swdkllj: v("total_swdkllj", "p_swdkllj"),
      dendaSwdkllj: v("total_denda_swdkllj", "p_denda_swdkllj"),
      stnk: v("total_stnk", "p_stnk"),
      plat: v("total_plat", "p_plat"),
      total: v("total_tagihan_normal", "total_tagihan_setelah_pemutihan"),
    };
  });
  baris.sort((a, b) => (a.jatuhTempo ?? "9").localeCompare(b.jatuhTempo ?? "9") || a.nopol.localeCompare(b.nopol));

  const pemutihan: InfoPemutihan = programAktif
    ? { nama: programAktif.nama, mulai: programAktif.tanggal_mulai, selesai: programAktif.tanggal_selesai, totalPotongan }
    : null;

  const data: SuratData = {
    jenis,
    instansi: opd.nama_opd,
    tanggal: new Date(),
    setelan: gabungSetelan(jenis, setelanRow),
    baris,
    pemutihan,
    lembarLampiran: 1,
  };
  data.lembarLampiran = await hitungLembarLampiran(data);

  let buffer: Buffer;
  if (format === "pdf") buffer = (await buatPdf(data)).buffer;
  else buffer = await buatDocx(data);

  // ---- Riwayat (hanya SPJT). Unduhan Word + PDF dalam 10 menit dihitung satu kali. ----
  if (jenis === "SPJT") {
    const batas = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: terakhir } = await supabase
      .from("riwayat_spjt")
      .select("id")
      .eq("opd_id", opdId)
      .gte("created_at", batas)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!terakhir) {
      const { data: riwayat } = await supabase.from("riwayat_spjt").insert({ opd_id: opdId, status: "Sudah Dibuat" }).select().single();
      if (riwayat) {
        const idPer = new Map(kendaraan.map((k) => [k.nomor_polisi_display, k.id]));
        await supabase.from("spjt_kendaraan").insert(
          baris.map((b) => ({
            riwayat_spjt_id: riwayat.id,
            kendaraan_id: idPer.get(b.nopol),
            pokok_pkb_snapshot: b.pokok,
            opsen_snapshot: b.opsen,
            swdkllj_snapshot: b.swdkllj,
            total_snapshot: b.total,
          }))
        );
        await supabase.from("activity_log").insert({
          jenis_aksi: "generate_spjt",
          deskripsi: `Generate SPJT untuk ${opd.nama_opd} (${baris.length} kendaraan)`,
          referensi_id: riwayat.id,
          referensi_tabel: "riwayat_spjt",
        });
      }
    }
  }

  const nama = namaBerkas(jenis, opd.nama_opd, format);
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nama}"`,
      "Cache-Control": "no-store",
    },
  });
}
