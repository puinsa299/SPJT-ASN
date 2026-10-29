import { createClient } from "@/lib/supabase/server";
import { MailCheck, Receipt, CalendarRange } from "lucide-react";

export const revalidate = 0;

const BULAN = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// CATATAN: agregasi bulanan di halaman ini dihitung di JS dari hasil query mentah.
// Untuk data dalam skala besar, pindahkan ke SQL view/RPC (date_trunc + group by)
// supaya tidak menarik seluruh baris kendaraan ke client setiap render.
export default async function StatistikPage() {
  const supabase = createClient();

  const [{ data: kendaraanKt }, { data: efektivitas }, { data: realisasi }] = await Promise.all([
    supabase.from("kendaraan").select("jatuh_tempo, opd_id").eq("plat", "KT").eq("status", "Aktif"),
    supabase.from("v_efektivitas_spjt").select("*"),
    supabase.from("v_realisasi_bulanan").select("bulan_realisasi, nominal, nominal_setelah_spjt, jumlah_transaksi, jumlah_kendaraan").order("bulan_realisasi"),
  ]);

  const { data: pembayaranTerakhir } = await supabase
    .from("v_kendaraan_pembayaran_terakhir")
    .select("kendaraan_id, total");

  const totalPerBulan: Record<number, number> = {};
  const opdPerBulan: Record<number, Set<string>> = {};
  const kendaraanPerBulan: Record<number, number> = {};

  kendaraanKt?.forEach((k) => {
    if (!k.jatuh_tempo) return;
    const bulan = new Date(k.jatuh_tempo).getMonth();
    kendaraanPerBulan[bulan] = (kendaraanPerBulan[bulan] ?? 0) + 1;
    opdPerBulan[bulan] = opdPerBulan[bulan] ?? new Set();
    opdPerBulan[bulan].add(k.opd_id);
  });

  const nilaiMap = new Map(pembayaranTerakhir?.map((p) => [p.kendaraan_id, p.total]) ?? []);

  // Realisasi diambil dari SEMUA transaksi hasil upload (v_realisasi_bulanan), bukan hanya
  // kendaraan yang sudah di-SPJT, supaya upload realisasi otomatis tampil di sini.
  const realisasiRows = (realisasi ?? []) as any[];

  const bucketCount = { "<1 bulan": 0, "1-3 bulan": 0, ">3 bulan": 0 };
  let sudahBayarSetelahSpjt = 0;
  let totalPernahSpjt = 0;
  efektivitas?.forEach((e: any) => {
    totalPernahSpjt += 1;
    if (e.sudah_bayar_setelah_spjt) sudahBayarSetelahSpjt += 1;
    else if (e.bucket_belum_bayar) {
      bucketCount[e.bucket_belum_bayar as keyof typeof bucketCount] += 1;
    }
  });
  const persentaseEfektivitas =
    totalPernahSpjt > 0 ? ((sudahBayarSetelahSpjt / totalPernahSpjt) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Statistik</h1>
        <p className="text-sm text-muted">Sebaran & tren kepatuhan pembayaran PKB.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="panel">
          <div className="panel-head">
            <MailCheck size={16} className="text-primary-600" />
            Efektivitas SPJT keseluruhan
          </div>
          <div className="p-5">
            <p className="text-3xl font-display font-bold text-primary-700">{persentaseEfektivitas}%</p>
            <p className="text-xs text-muted mb-4">
              {sudahBayarSetelahSpjt} dari {totalPernahSpjt} kendaraan yang pernah diberi SPJT sudah
              bayar
            </p>
            <h3 className="text-xs text-muted mb-2">Belum bayar sejak SPJT terbit</h3>
            <div className="space-y-2 text-sm">
              <Row label="< 1 bulan" value={bucketCount["<1 bulan"]} badge="badge-masih-aktif" />
              <Row label="1 - 3 bulan" value={bucketCount["1-3 bulan"]} badge="badge-luar-daerah" />
              <Row label="> 3 bulan" value={bucketCount[">3 bulan"]} badge="badge-belum-bayar" />
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <Receipt size={16} className="text-primary-600" />
            Realisasi aktual pembayaran per bulan
          </div>
          <table className="w-full table-clean">
            <thead>
              <tr>
                <th>Bulan bayar</th>
                <th className="text-right">Transaksi</th>
                <th className="text-right">Kendaraan</th>
                <th className="text-right">Realisasi</th>
                <th className="text-right">Setelah SPJT</th>
              </tr>
            </thead>
            <tbody>
              {realisasiRows.map((r) => (
                <tr key={r.bulan_realisasi}>
                  <td>{new Date(r.bulan_realisasi).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</td>
                  <td className="text-right">{Number(r.jumlah_transaksi).toLocaleString("id-ID")}</td>
                  <td className="text-right">{Number(r.jumlah_kendaraan).toLocaleString("id-ID")}</td>
                  <td className="text-right font-medium">Rp {Number(r.nominal ?? 0).toLocaleString("id-ID")}</td>
                  <td className="text-right text-muted">Rp {Number(r.nominal_setelah_spjt ?? 0).toLocaleString("id-ID")}</td>
                </tr>
              ))}
              {realisasiRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-muted py-6">Belum ada data realisasi</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <CalendarRange size={16} className="text-primary-600" />
          Sebaran per bulan (tahun berjalan)
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Bulan</th>
              <th className="text-right">OPD dgn kendaraan jatuh tempo</th>
              <th className="text-right">Kendaraan jatuh tempo</th>
            </tr>
          </thead>
          <tbody>
            {BULAN.map((label, i) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="text-right">{opdPerBulan[i]?.size ?? 0}</td>
                <td className="text-right">{kendaraanPerBulan[i] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: number; badge?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted">{label}</span>
      {badge ? <span className={`badge-status ${badge}`}>{value}</span> : <span className="font-medium">{value}</span>}
    </div>
  );
}
