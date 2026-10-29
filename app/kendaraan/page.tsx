import { createClient } from "@/lib/supabase/server";
import { Search, UserX } from "lucide-react";

export const revalidate = 0;

const SORTABLE = ["nomor_polisi_display", "nama_pemilik", "jenis", "tahun", "jatuh_tempo", "status"];

export default async function KendaraanPage({
  searchParams,
}: {
  searchParams: { sort?: string; dir?: string; q?: string; filter?: string };
}) {
  const supabase = createClient();

  const sort = SORTABLE.includes(searchParams.sort ?? "") ? searchParams.sort! : "nomor_polisi_display";
  const asc = searchParams.dir !== "desc";

  let query = supabase
    .from("kendaraan")
    .select("*, opd(nama_opd)")
    .order(sort, { ascending: asc })
    .limit(200);

  if (searchParams.q) {
    query = query.or(
      `nomor_polisi_display.ilike.%${searchParams.q}%,nama_pemilik.ilike.%${searchParams.q}%`
    );
  }
  if (searchParams.filter === "belum_balik_nama") {
    query = query.eq("belum_balik_nama", true);
  }

  const { data: kendaraanList } = await query;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Data kendaraan</h1>
        <p className="text-sm text-muted">
          Seluruh kendaraan terdata. Klik header kolom untuk sort, gunakan Ubah Status untuk
          mencatat dijual/rusak/mutasi.
        </p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <form method="get" className="relative w-72">
          <input type="hidden" name="filter" value={searchParams.filter ?? ""} />
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            name="q"
            defaultValue={searchParams.q}
            placeholder="Cari no. polisi atau nama pemilik..."
            className="border border-line rounded-lg pl-8 pr-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </form>

        <a
          href={searchParams.filter === "belum_balik_nama" ? "/kendaraan" : "/kendaraan?filter=belum_balik_nama"}
          className={`text-xs font-medium rounded-lg px-3 py-2 border inline-flex items-center gap-1.5 ${
            searchParams.filter === "belum_balik_nama"
              ? "bg-amber-100 border-amber-300 text-amber-800"
              : "border-line text-muted hover:bg-surface"
          }`}
        >
          <UserX size={13} />
          {searchParams.filter === "belum_balik_nama" ? "Menampilkan: Belum Balik Nama ✕" : "Filter: Belum Balik Nama"}
        </a>
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full table-clean">
          <thead>
            <tr>
              <SortHeader label="No. Polisi" field="nomor_polisi_display" current={sort} asc={asc} q={searchParams.q} />
              <SortHeader label="Pemilik" field="nama_pemilik" current={sort} asc={asc} q={searchParams.q} />
              <th>OPD</th>
              <th>Keterangan</th>
              <SortHeader label="Jenis" field="jenis" current={sort} asc={asc} q={searchParams.q} />
              <th>Merk / Model</th>
              <SortHeader label="Tahun" field="tahun" current={sort} asc={asc} q={searchParams.q} />
              <SortHeader label="Jatuh tempo" field="jatuh_tempo" current={sort} asc={asc} q={searchParams.q} />
              <SortHeader label="Status" field="status" current={sort} asc={asc} q={searchParams.q} />
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {kendaraanList?.map((k: any) => (
              <tr key={k.id}>
                <td className="font-medium">{k.nomor_polisi_display}</td>
                <td>
                  {k.nama_pemilik}
                  {k.belum_balik_nama && (
                    <div className="mt-1">
                      <span className="badge-status badge-belum-bayar" title={`Nama di Samsat: ${k.nama_pemilik_transaksi ?? "-"}`}>
                        <UserX size={11} /> Belum balik nama
                      </span>
                    </div>
                  )}
                </td>
                <td className="text-muted">{k.opd?.nama_opd}</td>
                <td>
                  <span className={`badge-status ${k.plat === "KT" ? "badge-sudah-bayar" : "badge-luar-daerah"}`}>
                    {k.plat === "KT" ? "Dalam Daerah" : "Luar Daerah"}
                  </span>
                </td>
                <td>{k.jenis}</td>
                <td>
                  {k.merk} {k.model}
                </td>
                <td>{k.tahun}</td>
                <td>{k.jatuh_tempo ?? "-"}</td>
                <td>{k.status}</td>
                <td className="space-x-2">
                  <a
                    href={`/kendaraan/${k.id}/edit?redirect_to=/kendaraan`}
                    className="text-primary-600 text-xs font-medium hover:underline"
                  >
                    Edit
                  </a>
                  <EditStatusForm kendaraanId={k.id} />
                </td>
              </tr>
            ))}
            {(!kendaraanList || kendaraanList.length === 0) && (
              <tr>
                <td colSpan={10} className="text-center text-muted py-6">
                  Tidak ada kendaraan yang cocok
                </td>
              </tr>
            )}
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
  q,
}: {
  label: string;
  field: string;
  current: string;
  asc: boolean;
  q?: string;
}) {
  const nextDir = current === field && asc ? "desc" : "asc";
  const params = new URLSearchParams({ sort: field, dir: nextDir, ...(q ? { q } : {}) });
  return (
    <th>
      <a href={`/kendaraan?${params.toString()}`} className="hover:text-ink">
        {label} {current === field ? (asc ? "▲" : "▼") : ""}
      </a>
    </th>
  );
}

// Form ubah status — dijual / rusak / mutasi (dgn dropdown OPD tujuan bila mutasi pindah OPD)
// Implementasi lengkap (modal + submit ke server action) di fase pengembangan berikutnya.
function EditStatusForm({ kendaraanId }: { kendaraanId: string }) {
  return (
    <a
      href={`/kendaraan/ubah-status?id=${kendaraanId}`}
      className="text-muted text-xs hover:underline"
    >
      Ubah status
    </a>
  );
}
