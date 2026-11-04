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
    const rows = await ambilSemua((a, b) =>
      supabase.from("kendaraan").select("*, opd(nama_opd)").order("nomor_polisi").range(a, b)
    );
    return berkasXlsx("data_master", "Master", [
      ["Nomor Polisi", (r: any) => r.nomor_polisi_display, 14],
      ["Nama Pengguna", (r: any) => r.nama_pengguna, 28],
      ["Nama Pemilik", (r: any) => r.nama_pemilik, 28],
      ["Instansi", (r: any) => r.opd?.nama_opd, 40],
      ["Plat", (r: any) => r.plat, 8],
      ["Warna Plat", (r: any) => r.warna_plat, 10],
      ["Status", (r: any) => r.status, 12],
      ["Jatuh Tempo", (r: any) => r.jatuh_tempo, 12],
      ["Merk", (r: any) => r.merk, 16],
      ["Model", (r: any) => r.model, 18],
      ["Tahun", (r: any) => r.tahun, 8],
      ["Kode Merk", (r: any) => r.kode_merk, 10],
      ["Kode Jenis", (r: any) => r.kode_jenis, 10],
      ["CC", (r: any) => r.cc, 8],
      ["No Rangka", (r: any) => r.no_rangka, 24],
      ["Belum Balik Nama", (r: any) => (r.belum_balik_nama ? "Ya" : ""), 16],
      ["Nama di Samsat (transaksi)", (r: any) => r.nama_pemilik_transaksi, 28],
    ], rows);
  } catch (e: any) {
    return galatJson("Gagal membuat file: " + (e?.message ?? e));
  }
}
