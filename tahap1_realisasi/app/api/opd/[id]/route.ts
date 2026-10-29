import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const nama_opd = formData.get("nama_opd") as string;
  const alamat = formData.get("alamat") as string;
  const kategori = formData.get("kategori") as string;
  const perlu_verifikasi = formData.get("perlu_verifikasi") === "on";

  await supabase
    .from("opd")
    .update({ nama_opd, alamat, kategori, perlu_verifikasi })
    .eq("id", params.id);

  await supabase.from("activity_log").insert({
    jenis_aksi: "edit_opd",
    deskripsi: `Mengubah data OPD: ${nama_opd}`,
    referensi_id: params.id,
    referensi_tabel: "opd",
    created_by: user.email,
  });

  return NextResponse.redirect(new URL(`/opd/${params.id}`, req.url), { status: 303 });
}
