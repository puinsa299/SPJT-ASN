import * as XLSX from "xlsx";
import { NextResponse } from "next/server";

export type Kolom<T> = [judul: string, ambil: (r: T) => unknown, lebar?: number];

// Ambil semua baris tabel/view per 1000 (batas bawaan Supabase), sampai habis atau mencapai batas.
export async function ambilSemua<T = any>(
  buat: (dari: number, sampai: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  batas = 60000
): Promise<T[]> {
  const hasil: T[] = [];
  for (let dari = 0; dari < batas; dari += 1000) {
    const { data, error } = await buat(dari, dari + 999);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    hasil.push(...data);
    if (data.length < 1000) break;
  }
  return hasil;
}

export function berkasXlsx<T>(nama: string, sheet: string, kolom: Kolom<T>[], baris: T[], catatan?: string): NextResponse {
  const aoa: unknown[][] = [kolom.map((k) => k[0]), ...baris.map((r) => kolom.map((k) => k[1](r) ?? ""))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = kolom.map((k) => ({ wch: k[2] ?? 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  if (catatan) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[catatan]]), "Catatan");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const tgl = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nama}_${tgl}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

export const galatJson = (pesan: string, status = 500) => NextResponse.json({ error: pesan }, { status });
