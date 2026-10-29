import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const payload = {
    isi_surat: formData.get("isi_surat") as string,
  };

  // pengaturan_template didesain sebagai single row — ambil id yang sudah ada, kalau belum ada insert baru.
  // HANYA isi_surat yang diupdate dari sini — field lain (nama pengirim, NIP, dst) sudah ditetapkan
  // di kode generate SPJT dan tidak diubah lewat form ini.
  const { data: existing } = await supabase.from("pengaturan_template").select("id").limit(1).single();

  if (existing) {
    await supabase.from("pengaturan_template").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("pengaturan_template").insert(payload);
  }

  await supabase.from("activity_log").insert({
    jenis_aksi: "edit_pengaturan",
    deskripsi: "Mengubah pengaturan template SPJT (isi surat / penandatangan)",
    created_by: user.email,
  });

  return NextResponse.redirect(new URL("/pengaturan?tersimpan=1", req.url), { status: 303 });
}
