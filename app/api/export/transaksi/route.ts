import { createClient } from "@/lib/supabase/server";
import { ambilSemua, berkasXlsx, galatJson } from "@/lib/export-xlsx";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATAS = 60000;

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return galatJson("Silakan login dulu", 401);
  try {
    const rows = await ambilSemua(
      (a, b) =>
        supabase
          .from("transaksi_pembayaran")
          .select("tanggal_bayar, masa_pajak_periode, pokok_pkb, opsen, swdkllj, total, kendaraan(nomor_polisi_display, nama_pengguna, nama_pemilik)")
          .order("tanggal_bayar", { ascending: false })
          .range(a, b),
      BATAS
    );
    return berkasXlsx(
      "data_transaksi",
      "Transaksi",
      [
        ["Nomor Polisi", (r: any) => r.kendaraan?.nomor_polisi_display, 14],
        ["Nama Pengguna", (r: any) => r.kendaraan?.nama_pengguna, 28],
        ["Nama Pemilik", (r: any) => r.kendaraan?.nama_pemilik, 28],
        ["Tanggal Bayar", (r: any) => r.tanggal_bayar, 12],
        ["Masa Pajak (Akhir PKB)", (r: any) => r.masa_pajak_periode, 14],
        ["Pokok PKB", (r: any) => r.pokok_pkb, 14],
        ["Opsen", (r: any) => r.opsen, 14],
        ["SWDKLLJ", (r: any) => r.swdkllj, 12],
        ["Total", (r: any) => r.total, 14],
      ],
      rows,
      rows.length >= BATAS ? `File dibatasi ${BATAS} baris terbaru.` : undefined
    );
  } catch (e: any) {
    return galatJson("Gagal membuat file: " + (e?.message ?? e));
  }
}
