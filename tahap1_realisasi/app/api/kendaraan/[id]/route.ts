import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizeNopol, platFromNopol } from "@/lib/nopol";
import { toProperCase } from "@/lib/text-clean";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const nomor_polisi_display = (formData.get("nomor_polisi_display") as string)?.trim();
  const nama_pemilik = formData.get("nama_pemilik") as string;
  const opd_id = formData.get("opd_id") as string;
  const jenis = formData.get("jenis") as string;
  const merk = formData.get("merk") as string;
  const model = formData.get("model") as string;
  const tahun = formData.get("tahun") ? Number(formData.get("tahun")) : null;
  const jatuh_tempo = (formData.get("jatuh_tempo") as string) || null;
  const warna_plat = (formData.get("warna_plat") as string) || null;

  await supabase
    .from("kendaraan")
    .update({
      nomor_polisi_display,
      nomor_polisi: normalizeNopol(nomor_polisi_display),
      plat: platFromNopol(nomor_polisi_display),
      nama_pemilik: toProperCase(nama_pemilik),
      opd_id,
      jenis,
      merk,
      model,
      tahun,
      jatuh_tempo,
      warna_plat,
    })
    .eq("id", params.id);

  await supabase.from("activity_log").insert({
    jenis_aksi: "edit_kendaraan",
    deskripsi: `Mengubah data kendaraan: ${nomor_polisi_display}`,
    referensi_id: params.id,
    referensi_tabel: "kendaraan",
    created_by: user.email,
  });

  const redirectTo = (formData.get("redirect_to") as string) || "/kendaraan";
  return NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
}
