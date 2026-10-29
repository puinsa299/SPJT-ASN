import { createClient } from "@/lib/supabase/server";
import { FileClock } from "lucide-react";

export const revalidate = 0;

export default async function HistoriPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Histori data</h1>
        <p className="text-sm text-muted">
          Seluruh aksi: import, export, ubah status, generate SPJT, dll.
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-head">
          <FileClock size={16} className="text-primary-600" />
          Log aktivitas
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Waktu</th>
              <th>Jenis aksi</th>
              <th>Deskripsi</th>
              <th>Oleh</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("id-ID")}
                </td>
                <td>
                  <span className="badge-status badge-luar-daerah">{a.jenis_aksi}</span>
                </td>
                <td>{a.deskripsi}</td>
                <td className="text-muted">{a.created_by ?? "-"}</td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  Belum ada aktivitas tercatat
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
