import { createClient } from "@/lib/supabase/server";
import { Search } from "lucide-react";

export const revalidate = 0;

export default async function OpdDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string };
}) {
  const supabase = createClient();

  const [{ data: opd }, { data: statistik }, { data: histori }] = await Promise.all([
    supabase.from("opd").select("*").eq("id", params.id).single(),
    supabase.from("v_statistik_pembayaran_opd").select("*").eq("opd_id", params.id).single(),
    supabase
      .from("riwayat_status")
      .select("*, kendaraan(nomor_polisi_display)")
      .eq("opd_asal_id", params.id)
      .order("tanggal", { ascending: false })
      .limit(20),
  ]);

  // Query kendaraan & status kepatuhannya dipisah (view tidak bisa di-nested-select
  // via foreign key karena tidak ada relasi FK terdaftar ke view), lalu digabung di JS.
  let kendaraanQuery = supabase
    .from("kendaraan")
    .select("*")
    .eq("opd_id", params.id)
    .order("nomor_polisi_display");

  if (searchParams.q) {
    kendaraanQuery = kendaraanQuery.or(
      `nomor_polisi_display.ilike.%${searchParams.q}%,nama_pemilik.ilike.%${searchParams.q}%`
    );
  }

  const { data: kendaraanList } = await kendaraanQuery;

  const kendaraanIds = (kendaraanList ?? []).map((k) => k.id);
  const { data: statusList } =
    kendaraanIds.length > 0
      ? await supabase
          .from("v_kendaraan_status")
          .select("kendaraan_id, status_kepatuhan")
          .in("kendaraan_id", kendaraanIds)
      : { data: [] };

  const statusMap = new Map((statusList ?? []).map((s) => [s.kendaraan_id, s.status_kepatuhan]));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{opd?.nama_opd}</h1>
          <p className="text-sm text-muted">{opd?.alamat}</p>
          <p className="text-xs text-muted/70 mt-1">{opd?.kategori}</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/opd/${params.id}/edit`}
            className="btn-secondary"
          >
            Edit OPD
          </a>
          <form action={`/api/spjt/generate?opd_id=${params.id}`} method="post">
            <button className="btn-primary">
              Generate SPJT
            </button>
          </form>
        </div>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MiniStat label="Total kendaraan" value={statistik?.total_kendaraan_kt ?? 0} />
        <MiniStat label="Sudah bayar" value={statistik?.sudah_bayar ?? 0} />
        <MiniStat label="Masih aktif" value={statistik?.masih_aktif ?? 0} />
        <MiniStat label="Belum bayar" value={statistik?.belum_bayar ?? 0} />
        <MiniStat label="% Kepatuhan" value={`${statistik?.persentase_kepatuhan ?? 0}%`} />
      </div>

      {/* List kendaraan */}
      <div className="panel overflow-x-auto">
        <div className="panel-head justify-between">
          <span>Daftar kendaraan</span>
          <form method="get" className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              name="q"
              defaultValue={searchParams.q}
              placeholder="Cari no. polisi / nama pemilik..."
              className="text-sm border border-line rounded-lg pl-8 pr-3 py-1.5 w-64 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </form>
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>No. Polisi</th>
              <th>Pemilik</th>
              <th>Jenis</th>
              <th>Merk</th>
              <th>Model</th>
              <th>Tahun</th>
              <th>Jatuh tempo</th>
              <th>Status</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {kendaraanList?.map((k: any) => (
              <tr key={k.id}>
                <td className="font-medium">{k.nomor_polisi_display}</td>
                <td>{k.nama_pemilik}</td>
                <td>{k.jenis}</td>
                <td>{k.merk}</td>
                <td>{k.model}</td>
                <td>{k.tahun}</td>
                <td>{k.jatuh_tempo ?? "-"}</td>
                <td>
                  <StatusBadge status={statusMap.get(k.id) ?? k.status} />
                </td>
                <td>
                  <VehicleActions kendaraanId={k.id} opdId={params.id} />
                </td>
              </tr>
            ))}
            {(!kendaraanList || kendaraanList.length === 0) && (
              <tr>
                <td colSpan={9} className="text-center text-muted py-6">
                  {searchParams.q ? "Tidak ada kendaraan yang cocok" : "Belum ada kendaraan terdata untuk OPD ini"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Histori kendaraan keluar */}
      <div className="panel">
        <div className="panel-head">Kendaraan keluar (histori)</div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>No. Polisi</th>
              <th>Status</th>
              <th>Keterangan</th>
              <th>Tanggal</th>
            </tr>
          </thead>
          <tbody>
            {histori?.map((h: any) => (
              <tr key={h.id}>
                <td>{h.kendaraan?.nomor_polisi_display}</td>
                <td>{h.status_baru}</td>
                <td className="text-muted">{h.keterangan}</td>
                <td className="text-muted">
                  {new Date(h.tanggal).toLocaleDateString("id-ID")}
                </td>
              </tr>
            ))}
            {(!histori || histori.length === 0) && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-6">
                  Belum ada histori
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="panel p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-display font-bold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Sudah Bayar"
      ? "badge-sudah-bayar"
      : status === "Belum Bayar"
      ? "badge-belum-bayar"
      : status === "Luar Daerah"
      ? "badge-luar-daerah"
      : "badge-masih-aktif";
  return <span className={`badge-status ${cls}`}>{status}</span>;
}

// Placeholder aksi — implementasi penuh (modal pilih OPD tujuan mutasi, dsb) di fase berikutnya
function VehicleActions({ kendaraanId, opdId }: { kendaraanId: string; opdId: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <a
        href={`/kendaraan/${kendaraanId}/edit?redirect_to=/opd/${opdId}`}
        className="text-primary-600 font-medium hover:underline"
      >
        Edit
      </a>
      <a href={`/kendaraan/ubah-status?id=${kendaraanId}`} className="text-muted hover:underline">
        Ubah status
      </a>
    </div>
  );
}
