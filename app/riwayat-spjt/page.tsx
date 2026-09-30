import { createClient } from "@/lib/supabase/server";
import { History, Download } from "lucide-react";

export const revalidate = 0;

export default async function RiwayatSpjtPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("riwayat_spjt")
    .select("*, opd(nama_opd), spjt_kendaraan(count)")
    .order("tanggal_terbit", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Riwayat SPJT</h1>
        <p className="text-sm text-muted">Jejak penerbitan SPJT & status pengirimannya.</p>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-head">
          <History size={16} className="text-primary-600" />
          Daftar SPJT diterbitkan
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Tanggal terbit</th>
              <th>OPD</th>
              <th>Jumlah kendaraan</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((r: any) => (
              <tr key={r.id}>
                <td>{r.tanggal_terbit}</td>
                <td className="font-medium">{r.opd?.nama_opd}</td>
                <td>{r.spjt_kendaraan?.[0]?.count ?? 0}</td>
                <td>
                  <StatusForm id={r.id} current={r.status} />
                </td>
                <td>
                  {r.file_path ? (
                    <a href={r.file_path} className="text-primary-600 text-xs font-medium hover:underline inline-flex items-center gap-1">
                      <Download size={12} /> Unduh docx
                    </a>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Update status pengiriman — Sudah Dibuat / Sudah Dikirim / Sudah Diterima
function StatusForm({ id, current }: { id: string; current: string }) {
  return (
    <form action={`/api/riwayat-spjt/${id}/status`} method="post">
      <select
        name="status"
        defaultValue={current}
        className="text-xs border border-line rounded-md px-2 py-1 bg-white"
      >
        <option>Sudah Dibuat</option>
        <option>Sudah Dikirim</option>
        <option>Sudah Diterima</option>
      </select>
    </form>
  );
}
