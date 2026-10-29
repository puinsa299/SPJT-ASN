import { createClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";
import Link from "next/link";

export const revalidate = 0;

export default async function EditOpdPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: opd } = await supabase.from("opd").select("*").eq("id", params.id).single();

  if (!opd) {
    return <p className="text-sm text-muted">OPD tidak ditemukan.</p>;
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href={`/opd/${params.id}`} className="text-xs text-primary-600 hover:underline">
          &larr; Kembali ke detail OPD
        </Link>
        <h1 className="text-xl font-bold mt-1">Edit data OPD</h1>
      </div>

      <form action={`/api/opd/${params.id}`} method="post" className="panel">
        <div className="panel-head">
          <Building2 size={16} className="text-primary-600" />
          {opd.nama_opd}
        </div>
        <div className="p-5 space-y-4">
          <Field label="Nama OPD">
            <input
              name="nama_opd"
              defaultValue={opd.nama_opd}
              required
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Alamat">
            <textarea
              name="alamat"
              defaultValue={opd.alamat ?? ""}
              rows={3}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm"
            />
          </Field>

          <Field label="Kategori">
            <select
              name="kategori"
              defaultValue={opd.kategori}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="Pemerintah Kota Samarinda">Pemerintah Kota Samarinda</option>
              <option value="Pemerintah Provinsi Kalimantan Timur">Pemerintah Provinsi Kalimantan Timur</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="perlu_verifikasi" defaultChecked={opd.perlu_verifikasi} />
            Perlu verifikasi (tandai kalau nama/data OPD ini masih perlu dicek ulang)
          </label>

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
