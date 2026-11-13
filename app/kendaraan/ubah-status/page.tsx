import { createClient } from "@/lib/supabase/server";
import { Truck } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

const STATUS = [
  { v: "Dijual", t: "Dijual" },
  { v: "Mutasi", t: "Mutasi (pindah instansi / keluar daerah)" },
  { v: "Ganti Nopol", t: "Ganti nopol" },
  { v: "Non-aktif", t: "Non-aktif (rusak / tidak digunakan)" },
  { v: "Aktif", t: "Aktif kembali" },
];

export default async function UbahStatusPage({ searchParams }: { searchParams: { id?: string } }) {
  const id = searchParams.id;
  const supabase = createClient();
  const [{ data: k }, { data: opdList }] = await Promise.all([
    id ? supabase.from("kendaraan").select("id, nomor_polisi_display, nama_pengguna, status, opd(nama_opd)").eq("id", id).single() : Promise.resolve({ data: null }),
    supabase.from("opd").select("id, nama_opd").order("nama_opd"),
  ]);

  if (!k) return <p className="text-sm text-muted">Kendaraan tidak ditemukan.</p>;
  const instansi = (k as any).opd?.nama_opd;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/kendaraan" className="text-xs text-primary-600 hover:underline">&larr; Kembali</Link>
        <h1 className="text-xl font-bold mt-1">Ubah status kendaraan</h1>
      </div>

      <form action={`/api/kendaraan/${k.id}/status`} method="post" className="panel">
        <div className="panel-head">
          <Truck size={16} className="text-primary-600" />
          {k.nomor_polisi_display}
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-muted">
            {k.nama_pengguna ? `${k.nama_pengguna} · ` : ""}{instansi ?? "-"} · status sekarang: <b>{k.status}</b>
          </p>

          <label className="block">
            <span className="text-sm text-muted block mb-1.5">Status baru</span>
            <select name="status" required className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
              {STATUS.map((s) => (
                <option key={s.v} value={s.v}>{s.t}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm text-muted block mb-1.5">Instansi tujuan (hanya untuk Mutasi pindah instansi)</span>
            <select name="opd_tujuan_id" className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">— tidak ada (mutasi keluar daerah / status lain) —</option>
              {(opdList ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.nama_opd}</option>
              ))}
            </select>
            <span className="text-xs text-muted block mt-1">Kalau diisi dengan status Mutasi, kendaraan pindah ke instansi tujuan dan tetap aktif.</span>
          </label>

          <label className="block">
            <span className="text-sm text-muted block mb-1.5">Keterangan</span>
            <input name="keterangan" className="w-full border border-line rounded-lg px-3 py-2 text-sm" placeholder="contoh: dijual ke pihak lain, surat nomor ..." />
          </label>

          <button className="btn-primary">Simpan</button>
        </div>
      </form>
    </div>
  );
}
