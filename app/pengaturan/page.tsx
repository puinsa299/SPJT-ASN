import { createClient } from "@/lib/supabase/server";
import { Settings, CheckCircle2 } from "lucide-react";

export const revalidate = 0;

export default async function PengaturanPage({
  searchParams,
}: {
  searchParams: { tersimpan?: string };
}) {
  const supabase = createClient();
  const { data: pengaturan } = await supabase.from("pengaturan_template").select("*").limit(1).single();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Pengaturan template SPJT</h1>
        <p className="text-sm text-muted">
          Isi surat yang dipakai setiap kali Generate SPJT. Format surat (kop, tabel, tanda tangan)
          sudah ditetapkan dan tidak bisa diubah dari sini.
        </p>
      </div>

      {searchParams.tersimpan === "1" && (
        <div className="panel p-4 flex items-center gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <p className="text-sm text-emerald-800 font-medium">Pengaturan berhasil disimpan.</p>
        </div>
      )}

      <form action="/api/pengaturan" method="post" className="panel">
        <div className="panel-head">
          <Settings size={16} className="text-primary-600" />
          Isi surat
        </div>
        <div className="p-5 space-y-5">
          <Field label="Isi surat (paragraf, gunakan ${nama_opd} sebagai placeholder nama OPD)">
            <textarea
              name="isi_surat"
              defaultValue={pengaturan?.isi_surat}
              rows={12}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </Field>

          <button className="btn-primary">Simpan pengaturan</button>
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
