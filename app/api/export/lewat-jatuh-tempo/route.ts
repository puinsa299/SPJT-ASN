import { createClient } from "@/lib/supabase/server";
import { ambilSemua, berkasXlsx, galatJson } from "@/lib/export-xlsx";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return galatJson("Silakan login dulu", 401);
  try {
    const status = await ambilSemua((a, b) =>
      supabase.from("v_kendaraan_status").select("kendaraan_id").eq("lewat_jatuh_tempo", true).range(a, b)
    );
    const idLewat = new Set(status.map((s: any) => s.kendaraan_id));
    const tagihan = await ambilSemua((a, b) => supabase.from("v_tagihan_pkb").select("*").range(a, b));
    const tm = new Map(tagihan.map((t: any) => [t.kendaraan_id, t]));
    const kend = (
      await ambilSemua((a, b) =>
        supabase.from("kendaraan").select("id, nomor_polisi_display, nama_pengguna, nama_pemilik, jatuh_tempo, opd(nama_opd)").eq("status", "Aktif").order("jatuh_tempo").range(a, b)
      )
    ).filter((k: any) => idLewat.has(k.id));
    const t = (r: any, f: string) => (tm.get(r.id) as any)?.[f];
    return berkasXlsx("kendaraan_lewat_jatuh_tempo", "Lewat Jatuh Tempo", [
      ["Nomor Polisi", (r: any) => r.nomor_polisi_display, 14],
      ["Nama Pengguna", (r: any) => r.nama_pengguna, 28],
      ["Nama Pemilik", (r: any) => r.nama_pemilik, 28],
      ["Instansi", (r: any) => r.opd?.nama_opd, 40],
      ["Jatuh Tempo", (r: any) => r.jatuh_tempo, 12],
      ["Tahun Menunggak", (r: any) => t(r, "tahun_menunggak"), 10],
      ["Pokok PKB", (r: any) => t(r, "total_pokok_pkb"), 14],
      ["Denda PKB", (r: any) => t(r, "total_denda_pkb"), 14],
      ["Sanksi Adm", (r: any) => t(r, "total_sanksi_adm"), 12],
      ["Opsen PKB", (r: any) => t(r, "total_opsen"), 14],
      ["Denda Opsen", (r: any) => t(r, "total_denda_opsen"), 12],
      ["SWDKLLJ", (r: any) => t(r, "total_swdkllj"), 12],
      ["Denda SWDKLLJ", (r: any) => t(r, "total_denda_swdkllj"), 12],
      ["STNK", (r: any) => t(r, "total_stnk"), 12],
      ["Plat", (r: any) => t(r, "total_plat"), 12],
      ["Total Tagihan", (r: any) => t(r, "total_tagihan_normal"), 16],
    ], kend);
  } catch (e: any) {
    return galatJson("Gagal membuat file: " + (e?.message ?? e));
  }
}
