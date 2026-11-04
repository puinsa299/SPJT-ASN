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
      supabase
        .from("riwayat_status")
        .select("tanggal, status_lama, status_baru, keterangan, sumber, created_by, kendaraan(nomor_polisi_display, nama_pengguna), opd_asal:opd!opd_asal_id(nama_opd), opd_tujuan:opd!opd_tujuan_id(nama_opd)")
        .order("tanggal", { ascending: false })
        .range(a, b)
    );
    return berkasXlsx("perubahan_status", "Perubahan Status", [
      ["Tanggal", (r: any) => (r.tanggal ? String(r.tanggal).slice(0, 10) : ""), 12],
      ["Nomor Polisi", (r: any) => r.kendaraan?.nomor_polisi_display, 14],
      ["Nama Pengguna", (r: any) => r.kendaraan?.nama_pengguna, 28],
      ["Status Lama", (r: any) => r.status_lama, 14],
      ["Status Baru", (r: any) => r.status_baru, 14],
      ["Instansi Asal", (r: any) => r.opd_asal?.nama_opd, 36],
      ["Instansi Tujuan", (r: any) => r.opd_tujuan?.nama_opd, 36],
      ["Keterangan", (r: any) => r.keterangan, 36],
      ["Sumber", (r: any) => r.sumber, 12],
      ["Dibuat Oleh", (r: any) => r.created_by, 24],
    ], rows);
  } catch (e: any) {
    return galatJson("Gagal membuat file: " + (e?.message ?? e));
  }
}
