import { createClient } from "@/lib/supabase/server";
import { IdCard } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

const SORTABLE = ["nama_opd", "total_kendaraan_kt", "persentase_kepatuhan", "potensi_nilai_pkb"];

export default async function ProfilingPage({
  searchParams,
}: {
  searchParams: { sort?: string; dir?: string };
}) {
  const supabase = createClient();
  const sort = SORTABLE.includes(searchParams.sort ?? "") ? searchParams.sort! : "potensi_nilai_pkb";
  const asc = searchParams.dir === "asc";

  const { data } = await supabase
    .from("v_profiling_opd")
    .select("*")
    .order(sort, { ascending: asc });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Profiling OPD</h1>
        <p className="text-sm text-muted">
          OPD diurutkan berdasarkan potensi nilai PKB, lengkap dengan tingkat kepatuhan.
        </p>
      </div>

      <div className="panel overflow-x-auto">
        <div className="panel-head">
          <IdCard size={16} className="text-primary-600" />
          Ranking OPD
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <SortHeader label="Nama OPD" field="nama_opd" current={sort} asc={asc} />
              <th>Kategori</th>
              <SortHeader label="Total kendaraan" field="total_kendaraan_kt" current={sort} asc={asc} />
              <SortHeader label="% Kepatuhan" field="persentase_kepatuhan" current={sort} asc={asc} />
              <SortHeader label="Potensi nilai PKB" field="potensi_nilai_pkb" current={sort} asc={asc} />
            </tr>
          </thead>
          <tbody>
            {data?.map((o) => (
              <tr key={o.opd_id}>
                <td className="font-medium">
                  <Link href={`/opd/${o.opd_id}`} className="text-primary-700 hover:underline">
                    {o.nama_opd}
                  </Link>
                </td>
                <td className="text-muted">{o.kategori}</td>
                <td>{o.total_kendaraan_kt}</td>
                <td>{o.persentase_kepatuhan}%</td>
                <td className="font-medium text-primary-700">
                  Rp {Number(o.potensi_nilai_pkb ?? 0).toLocaleString("id-ID")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  asc,
}: {
  label: string;
  field: string;
  current: string;
  asc: boolean;
}) {
  const nextDir = current === field && asc ? "desc" : "asc";
  return (
    <th>
      <a href={`/profiling?sort=${field}&dir=${nextDir}`}>
        {label} {current === field ? (asc ? "▲" : "▼") : ""}
      </a>
    </th>
  );
}
