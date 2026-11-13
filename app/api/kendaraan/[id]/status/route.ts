import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const BOLEH = ["Aktif", "Dijual", "Mutasi", "Ganti Nopol", "Non-aktif"];

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi login habis, silakan login ulang" }, { status: 401 });

  const f = await req.formData();
  const status = String(f.get("status") ?? "");
  const opdTujuan = String(f.get("opd_tujuan_id") ?? "") || null;
  const keterangan = String(f.get("keterangan") ?? "").trim() || null;
  if (!BOLEH.includes(status)) return NextResponse.json({ error: "Status tidak valid" }, { status: 400 });

  const { data: k } = await supabase.from("kendaraan").select("nomor_polisi_display").eq("id", params.id).single();
  if (!k) return NextResponse.json({ error: "Kendaraan tidak ditemukan" }, { status: 404 });

  // Cukup menambah riwayat; trigger di database yang menerapkan perubahannya ke kendaraan.
  const { error } = await supabase.from("riwayat_status").insert({
    kendaraan_id: params.id,
    status_baru: status,
    opd_tujuan_id: status === "Mutasi" ? opdTujuan : null,
    keterangan,
    sumber: "Manual",
    created_by: user.email,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    jenis_aksi: "ubah_status_kendaraan",
    deskripsi: `Ubah status ${k.nomor_polisi_display} menjadi ${status}${keterangan ? ` (${keterangan})` : ""}`,
    referensi_id: params.id,
    referensi_tabel: "kendaraan",
    created_by: user.email,
  });

  return NextResponse.redirect(new URL("/kendaraan", req.url), { status: 303 });
}
