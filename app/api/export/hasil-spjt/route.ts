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
      supabase.from("v_kendaraan_status").select("kendaraan_id, status_kepatuhan, tanggal_bayar_terakhir, masuk_periode_spjt, lewat_jatuh_tempo").range(a, b)
    );
    const sm = new Map(status.map((s: any) => [s.kendaraan_id, s]));
    const kend = await ambilSemua((a, b) =>
      supabase.from("kendaraan").select("id, nomor_polisi_display, nama_pengguna, nama_pemilik, jatuh_tempo, opd(nama_opd)").eq("status", "Aktif").order("nomor_polisi").range(a, b)
    );
    return berkasXlsx("hasil_spjt", "Hasil SPJT", [
      ["Nomor Polisi", (r: any) => r.nomor_polisi_display, 14],
      ["Nama Pengguna", (r: any) => r.nama_pengguna, 28],
      ["Nama Pemilik", (r: any) => r.nama_pemilik, 28],
      ["Instansi", (r: any) => r.opd?.nama_opd, 40],
      ["Jatuh Tempo", (r: any) => r.jatuh_tempo, 12],
      ["Status Kepatuhan", (r: any) => (sm.get(r.id) as any)?.status_kepatuhan, 16],
      ["Tanggal Bayar Terakhir", (r: any) => (sm.get(r.id) as any)?.tanggal_bayar_terakhir, 16],
      ["Masuk Periode SPJT", (r: any) => ((sm.get(r.id) as any)?.masuk_periode_spjt ? "Ya" : ""), 14],
      ["Lewat Jatuh Tempo", (r: any) => ((sm.get(r.id) as any)?.lewat_jatuh_tempo ? "Ya" : ""), 14],
    ], kend);
  } catch (e: any) {
    return galatJson("Gagal membuat file: " + (e?.message ?? e));
  }
}
