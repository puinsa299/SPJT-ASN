import { createClient } from "@/lib/supabase/server";
import { CalendarCheck } from "lucide-react";

export const revalidate = 0;

export default async function SpjtHariIniPage({
  searchParams,
}: {
  searchParams: { dir?: string };
}) {
  const supabase = createClient();
  const asc = searchParams.dir !== "desc";

  const { data } = await supabase
    .from("v_spjt_hari_ini")
    .select("*")
    .order("sisa_hari", { ascending: asc });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">SPJT hari ini</h1>
        <p className="text-sm text-muted">Seluruh kendaraan yang jatuh tempo hari ini.</p>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-head">
          <CalendarCheck size={16} className="text-primary-600" />
          Kendaraan jatuh tempo hari ini
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>No. Polisi</th>
              <th>Pemilik</th>
              <th>Instansi</th>
              <th>Merk / Model</th>
              <th>Tahun</th>
              <th>Jatuh tempo</th>
              <th>
                <a href={`/spjt-hari-ini?dir=${asc ? "desc" : "asc"}`}>
                  Sisa hari {asc ? "▲" : "▼"}
                </a>
              </th>
              <th>Tunggakan instansi</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((k: any) => (
              <tr key={k.kendaraan_id}>
                <td className="font-medium">{k.nomor_polisi_display}</td>
                <td>{k.nama_pemilik}</td>
                <td>{k.nama_opd}</td>
                <td>
                  {k.merk} {k.model}
                </td>
                <td>{k.tahun}</td>
                <td>{k.jatuh_tempo}</td>
                <td>
                  <span className="badge-status badge-belum-bayar">{k.sisa_hari} hari</span>
                </td>
                <td>{k.jumlah_tunggakan_instansi} kendaraan</td>
              </tr>
            ))}
            {(!data || data.length === 0) && (
              <tr>
                <td colSpan={8} className="text-center text-muted py-6">
                  Tidak ada kendaraan jatuh tempo hari ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
