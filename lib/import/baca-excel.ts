// Membaca file Excel DI BROWSER (bukan di server), supaya file besar tidak kena batas
// ukuran unggahan dan batas waktu proses server (Netlify).
import * as XLSX from "xlsx";

export type SheetData = { nama: string; baris: unknown[][] };

export async function bacaExcel(file: File, hanyaSheetPertama = false): Promise<SheetData[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", dense: true, cellDates: false });
  const nama = hanyaSheetPertama ? wb.SheetNames.slice(0, 1) : wb.SheetNames;
  return nama.map((n) => ({
    nama: n,
    baris: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: false }),
  }));
}

// Kirim JSON ke server dengan percobaan ulang bila jaringan putus sesaat.
export async function kirimJson<T = any>(url: string, body: unknown, percobaan = 3): Promise<T> {
  let galat = "";
  for (let i = 0; i < percobaan; i++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const teks = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(teks);
      } catch {
        /* bukan JSON */
      }
      if (res.ok && json) return json as T;
      galat = json?.error ?? `Server membalas ${res.status}${teks && !json ? `: ${teks.slice(0, 120)}` : ""}`;
      if (res.status === 401 || res.status === 400) break; // tidak perlu diulang
    } catch (e: any) {
      galat = e?.message ?? "Koneksi terputus";
    }
    await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error(galat || "Gagal menghubungi server");
}
