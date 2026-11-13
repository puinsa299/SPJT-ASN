import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi login habis, silakan login ulang" }, { status: 401 });

  const status = String((await req.formData()).get("status") ?? "");
  if (!["Sudah Dibuat", "Sudah Dikirim", "Sudah Diterima"].includes(status)) {
    return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });
  }
  const { error } = await supabase.from("riwayat_spjt").update({ status }).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(new URL("/riwayat-spjt", req.url), { status: 303 });
}
