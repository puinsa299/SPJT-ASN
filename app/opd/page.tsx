import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export const revalidate = 0;

export default async function OpdPage({
  searchParams,
}: {
  searchParams: { kategori?: string; q?: string };
}) {
  const supabase = createClient();

  let query = supabase.from("v_statistik_pembayaran_opd").select("*").order("nama_opd");

  if (searchParams.kategori) {
    query = query.eq("kategori", searchParams.kategori);
  }
  if (searchParams.q) {
    query = query.ilike("nama_opd", `%${searchParams.q}%`);
  }

  const { data: opdList } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Data organisasi perangkat daerah</h1>
        <p className="text-sm text-muted">Seluruh OPD terdata, dengan ringkasan kepatuhan.</p>
      </div>

      <form className="flex gap-3 items-center" method="get">
        <input
          type="text"
          name="q"
          defaultValue={searchParams.q}
          placeholder="Cari nama OPD..."
          className="border border-line rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
        <div className="flex gap-2 text-sm">
          <FilterLink
            label="Semua"
            active={!searchParams.kategori}
            href={{ q: searchParams.q }}
          />
          <FilterLink
            label="Prov. Kaltim"
            active={searchParams.kategori === "Pemerintah Provinsi Kalimantan Timur"}
            href={{ kategori: "Pemerintah Provinsi Kalimantan Timur", q: searchParams.q }}
          />
          <FilterLink
            label="Kota Samarinda"
            active={searchParams.kategori === "Pemerintah Kota Samarinda"}
            href={{ kategori: "Pemerintah Kota Samarinda", q: searchParams.q }}
          />
        </div>
      </form>

      <div className="panel overflow-hidden">
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Nama OPD</th>
              <th>Kategori</th>
              <th className="text-right">Total kendaraan (KT)</th>
              <th className="text-right">Sudah bayar</th>
              <th className="text-right">Masih aktif</th>
              <th className="text-right">Belum bayar</th>
              <th className="text-right">% Kepatuhan</th>
            </tr>
          </thead>
          <tbody>
            {opdList?.map((o) => (
              <tr key={o.opd_id}>
                <td>
                  <Link href={`/opd/${o.opd_id}`} className="text-primary-700 font-medium hover:underline inline-flex items-center gap-1.5">
                    {o.nama_opd}
                    {o.perlu_verifikasi && (
                      <span title="Otomatis dibuat dari import, perlu dicek">
                        <AlertCircle size={13} className="text-amber-500" />
                      </span>
                    )}
                  </Link>
                </td>
                <td className="text-muted">{o.kategori}</td>
                <td className="text-right">{o.total_kendaraan_kt}</td>
                <td className="text-right">{o.sudah_bayar}</td>
                <td className="text-right">{o.masih_aktif}</td>
                <td className="text-right">{o.belum_bayar}</td>
                <td className="text-right font-semibold text-primary-700">{o.persentase_kepatuhan}%</td>
              </tr>
            ))}
            {(!opdList || opdList.length === 0) && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-6">
                  Tidak ada data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterLink({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams(
    Object.entries(href).filter(([, v]) => v) as [string, string][]
  );
  return (
    <Link
      href={`/opd?${params.toString()}`}
      className={`px-3 py-1.5 rounded-lg border ${
        active ? "bg-primary-50 border-primary-200 text-primary-700 font-medium" : "border-line text-muted"
      }`}
    >
      {label}
    </Link>
  );
}
