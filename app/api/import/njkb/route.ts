import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Import tabel NJKB — dipecah per potongan kecil dari browser (file dibaca di browser),
// supaya tidak kena batas ukuran unggahan & batas waktu Netlify.
//   aksi "mulai"   : kosongkan tabel njkb_ref (dipanggil sekali, setelah file berhasil dibaca)
//   aksi "batch"   : simpan satu potongan baris
//   aksi "selesai" : catat ke import_log & activity_log
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sesi login habis, silakan login ulang" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Data tidak terbaca" }, { status: 400 });
  }

  if (body.aksi === "mulai") {
    const { error } = await supabase.from("njkb_ref").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return NextResponse.json({ error: `Gagal mengosongkan tabel NJKB lama: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.aksi === "batch") {
    const baris = Array.isArray(body.baris) ? body.baris : [];
    if (baris.length === 0) return NextResponse.json({ ok: true, tersimpan: 0 });
    const payload = baris.map((b: any) => ({
      kategori: String(b.kategori),
      kode_merk: b.kode_merk ?? null,
      merk: b.merk ?? null,
      type: b.type ?? null,
      merk_norm: String(b.merk_norm ?? ""),
      type_norm: String(b.type_norm ?? ""),
      tahun_buat: Number(b.tahun_buat),
      njkb: Number(b.njkb),
      bobot: Number(b.bobot ?? 1),
      dp_pkb: b.dp_pkb === null || b.dp_pkb === undefined ? null : Number(b.dp_pkb),
    }));
    const { error } = await supabase.from("njkb_ref").insert(payload);
    if (error) return NextResponse.json({ error: `Gagal menyimpan data NJKB: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, tersimpan: payload.length });
  }

  if (body.aksi === "selesai") {
    await supabase.from("import_log").insert({
      jenis_import: "Database Master",
      nama_file: String(body.nama_file ?? ""),
      jumlah_ditambah: Number(body.jumlah ?? 0),
      catatan: `Import tabel NJKB — ${String(body.ringkasan ?? "")}`.slice(0, 1000),
      created_by: user.email,
    });
    await supabase.from("activity_log").insert({
      jenis_aksi: "import_njkb",
      deskripsi: `Import tabel NJKB: ${Number(body.jumlah ?? 0)} baris (sheet dilewati: ${String(body.dilewati ?? "-")})`.slice(0, 1000),
      created_by: user.email,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
}
