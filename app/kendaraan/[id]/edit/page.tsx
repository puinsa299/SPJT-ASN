import { createClient } from "@/lib/supabase/server";
import { Truck } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

export default async function EditKendaraanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { redirect_to?: string };
}) {
  const supabase = createClient();
  const [{ data: kendaraan }, { data: opdList }] = await Promise.all([
    supabase.from("kendaraan").select("*").eq("id", params.id).single(),
    supabase.from("opd").select("id, nama_opd").order("nama_opd"),
  ]);

  if (!kendaraan) {
    return <p className="text-sm text-muted">Kendaraan tidak ditemukan.</p>;
  }

  const backHref = searchParams.redirect_to || "/kendaraan";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={backHref} className="text-xs text-primary-600 hover:underline">
          &larr; Kembali
        </Link>
        <h1 className="text-xl font-bold mt-1">Edit data kendaraan</h1>
      </div>

      <form action={`/api/kendaraan/${params.id}`} method="post" className="panel">
        <input type="hidden" name="redirect_to" value={backHref} />
        <div className="panel-head">
          <Truck size={16} className="text-primary-600" />
          {kendaraan.nomor_polisi_display}
        </div>
        <div className="p-5 space-y-4">
          <Field label="Nomor polisi">
            <input
              name="nomor_polisi_display"
              defaultValue={kendaraan.nomor_polisi_display}
              required
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Nama pemilik">
            <input
              name="nama_pemilik"
              defaultValue={kendaraan.nama_pemilik ?? ""}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <Field label="OPD">
            <select
              name="opd_id"
              defaultValue={kendaraan.opd_id}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              {opdList?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nama_opd}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Jenis">
              <input name="jenis" defaultValue={kendaraan.jenis ?? ""} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Tahun">
              <input name="tahun" type="number" defaultValue={kendaraan.tahun ?? ""} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Merk">
              <input name="merk" defaultValue={kendaraan.merk ?? ""} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
            <Field label="Model">
              <input name="model" defaultValue={kendaraan.model ?? ""} className="w-full border border-line rounded-lg px-3 py-2 text-sm" />
            </Field>
          </div>

          <Field label="Jatuh tempo">
            <input
              type="date"
              name="jatuh_tempo"
              defaultValue={kendaraan.jatuh_tempo ?? ""}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <p className="text-xs text-muted">
            Plat (KT/Non KT) otomatis mengikuti 2 huruf depan nomor polisi. Untuk ubah status
            (Dijual/Mutasi/dll), gunakan tombol "Ubah status" di daftar kendaraan.
          </p>

          <button className="btn-primary">
            Simpan perubahan
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-muted block mb-1.5">{label}</label>
      {children}
    </div>
  );
}
