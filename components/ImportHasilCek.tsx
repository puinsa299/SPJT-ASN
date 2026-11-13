"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Loader2, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { bacaExcel, kirimJson } from "@/lib/import/baca-excel";
import { BarisHasilCek, Dilewati, bacaHasilCek } from "@/lib/import/hasil-cek";
import { normalizeNopol } from "@/lib/nopol";

const UKURAN_POTONGAN = 400;

type Pratinjau = {
  perStatus: Record<string, number>;
  jumlahRealisasi: number;
  jumlahUbahJatuhTempo: number;
  jumlahMundur: number;
  sudahTercatat: number;
  dilewati: Dilewati[];
  contohRealisasi: any[];
  contohJatuhTempo: any[];
};

const tgl = (v: string | null | undefined) => {
  if (!v) return "-";
  const [y, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

// Nopol yang sama dikirim dalam potongan yang sama supaya urutan pemrosesannya terjaga.
function buatPotongan(baris: BarisHasilCek[]): BarisHasilCek[][] {
  const urut = [...baris].sort((a, b) => normalizeNopol(a.nopol).localeCompare(normalizeNopol(b.nopol)) || a.baris - b.baris);
  const out: BarisHasilCek[][] = [];
  let cur: BarisHasilCek[] = [];
  for (let i = 0; i < urut.length; i++) {
    cur.push(urut[i]);
    const berikut = urut[i + 1];
    const putus = !berikut || normalizeNopol(berikut.nopol) !== normalizeNopol(urut[i].nopol);
    if (cur.length >= UKURAN_POTONGAN && putus) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export default function ImportHasilCek() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [status, setStatus] = useState("");
  const [galat, setGalat] = useState("");
  const [baris, setBaris] = useState<BarisHasilCek[]>([]);
  const [namaFile, setNamaFile] = useState("");
  const [pratinjau, setPratinjau] = useState<Pratinjau | null>(null);
  const [catatRealisasi, setCatatRealisasi] = useState(true);
  const [ubahJatuhTempo, setUbahJatuhTempo] = useState(true);
  const [hasil, setHasil] = useState<null | { realisasi: number; kendaraan: number; jatuhTempo: number; sudahTercatat: number; dilewati: number }>(null);
  const [dilewatiAkhir, setDilewatiAkhir] = useState<Dilewati[]>([]);

  const opsi = () => ({ realisasi: catatRealisasi, jatuhTempo: ubahJatuhTempo });

  async function hitungPratinjau(rows: BarisHasilCek[], o = opsi()) {
    const agg: Pratinjau = { perStatus: {}, jumlahRealisasi: 0, jumlahUbahJatuhTempo: 0, jumlahMundur: 0, sudahTercatat: 0, dilewati: [], contohRealisasi: [], contohJatuhTempo: [] };
    const potongan = buatPotongan(rows);
    for (let i = 0; i < potongan.length; i++) {
      setStatus(`Memeriksa data... (${i + 1}/${potongan.length})`);
      const r: any = await kirimJson("/api/import/hasil-cek", { mode: "rencana", rows: potongan[i], opsi: o });
      for (const [k, v] of Object.entries(r.perStatus as Record<string, number>)) agg.perStatus[k] = (agg.perStatus[k] ?? 0) + v;
      agg.jumlahRealisasi += r.jumlahRealisasi;
      agg.jumlahUbahJatuhTempo += r.jumlahUbahJatuhTempo;
      agg.jumlahMundur += r.jumlahMundur;
      agg.sudahTercatat += r.sudahTercatat;
      agg.dilewati.push(...r.dilewati);
      if (agg.contohRealisasi.length < 40) agg.contohRealisasi.push(...r.contohRealisasi.slice(0, 40 - agg.contohRealisasi.length));
      if (agg.contohJatuhTempo.length < 40) agg.contohJatuhTempo.push(...r.contohJatuhTempo.slice(0, 40 - agg.contohJatuhTempo.length));
    }
    return agg;
  }

  async function bacaDanPratinjau(e: React.FormEvent) {
    e.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setSibuk(true);
    setGalat("");
    setHasil(null);
    setPratinjau(null);
    setDilewatiAkhir([]);
    try {
      setStatus(`Membaca ${file.name}...`);
      const sheets = await bacaExcel(file, false);
      const h = bacaHasilCek(sheets);
      if (!h.ok) throw new Error(h.pesan);
      if (h.baris.length === 0) throw new Error("Tidak ada baris data pada file ini.");
      setBaris(h.baris);
      setNamaFile(file.name);
      setPratinjau(await hitungPratinjau(h.baris));
    } catch (err: any) {
      setGalat(err?.message ?? "Terjadi kesalahan");
      setBaris([]);
    } finally {
      setSibuk(false);
      setStatus("");
    }
  }

  // Ubah kotak centang -> pratinjau dihitung ulang (tidak mengubah data)
  async function ubahOpsi(r: boolean, j: boolean) {
    setCatatRealisasi(r);
    setUbahJatuhTempo(j);
    if (!baris.length) return;
    setSibuk(true);
    try {
      setPratinjau(await hitungPratinjau(baris, { realisasi: r, jatuhTempo: j }));
    } catch (err: any) {
      setGalat(err?.message ?? "Terjadi kesalahan");
    } finally {
      setSibuk(false);
      setStatus("");
    }
  }

  async function terapkan() {
    if (!baris.length) return;
    const ok = window.confirm(
      "Perubahan akan disimpan ke database.\n\nPastikan hanya satu tab/perangkat yang membuka aplikasi, dan unduh cadangan dulu (menu Export Data).\n\nLanjutkan?"
    );
    if (!ok) return;
    setSibuk(true);
    setGalat("");
    try {
      const total = { realisasi: 0, kendaraan: 0, jatuhTempo: 0, sudahTercatat: 0 };
      const dilewati: Dilewati[] = [];
      const potongan = buatPotongan(baris);
      for (let i = 0; i < potongan.length; i++) {
        setStatus(`Menyimpan... (${i + 1}/${potongan.length})`);
        const r: any = await kirimJson("/api/import/hasil-cek", { mode: "terapkan", rows: potongan[i], opsi: opsi(), nama_file: namaFile });
        total.realisasi += r.realisasi;
        total.kendaraan += r.kendaraan;
        total.jatuhTempo += r.jatuhTempo;
        total.sudahTercatat += r.sudahTercatat;
        dilewati.push(...r.dilewati);
      }
      await kirimJson("/api/import/hasil-cek", {
        mode: "selesai",
        nama_file: namaFile,
        total: { realisasi: total.realisasi, kendaraan: total.kendaraan, jatuh_tempo: total.jatuhTempo, dilewati: dilewati.length },
      });
      setHasil({ ...total, dilewati: dilewati.length });
      setDilewatiAkhir(dilewati);
      setPratinjau(null);
      setBaris([]);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      setGalat(`${err?.message ?? "Terjadi kesalahan"}. Sebagian perubahan mungkin sudah tersimpan; jalankan pratinjau lagi untuk melihat sisanya (aman diulang).`);
    } finally {
      setSibuk(false);
      setStatus("");
    }
  }

  function unduhLaporan(daftar: Dilewati[]) {
    const aoa = [["No. Polisi", "Surat", "Status", "Alasan", "Keterangan"], ...daftar.map((d) => [d.nopol, d.surat, d.status, d.alasan, d.keterangan])];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 18 }, { wch: 40 }, { wch: 70 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dilewati");
    XLSX.writeFile(wb, `laporan_baris_dilewati_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const dilewatiTampil = pratinjau?.dilewati ?? dilewatiAkhir;
  const bisaTerapkan = !!pratinjau && !sibuk && ((catatRealisasi && pratinjau.jumlahRealisasi > 0) || (ubahJatuhTempo && pratinjau.jumlahUbahJatuhTempo > 0));

  return (
    <div className="space-y-4">
      <form onSubmit={bacaDanPratinjau} className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".xlsx" required className="text-sm" />
        <button type="submit" disabled={sibuk} className="btn-secondary">
          Baca &amp; Pratinjau
        </button>
        {sibuk && (
          <span className="text-xs text-muted inline-flex items-center gap-1.5">
            <Loader2 size={14} className="animate-spin" /> {status || "Memproses..."}
          </span>
        )}
      </form>

      {galat && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{galat}</span>
        </div>
      )}

      {hasil && (
        <div className="flex items-start gap-2 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Perubahan diterapkan.</p>
            <p>
              {hasil.realisasi} realisasi dicatat, {hasil.kendaraan} kendaraan diperbarui, {hasil.jatuhTempo} jatuh tempo diubah,{" "}
              {hasil.sudahTercatat} sudah tercatat sebelumnya (tidak dobel), {hasil.dilewati} baris dilewati.
            </p>
          </div>
        </div>
      )}

      {pratinjau && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {Object.entries(pratinjau.perStatus).map(([k, v]) => (
              <div key={k} className="border border-line rounded-lg p-2.5">
                <p className="text-muted">{k}</p>
                <p className="text-base font-bold">{v}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
            <Kartu label="Realisasi akan dicatat" nilai={pratinjau.jumlahRealisasi} />
            <Kartu label="Sudah tercatat (dilewati)" nilai={pratinjau.sudahTercatat} />
            <Kartu label="Jatuh tempo akan diubah" nilai={pratinjau.jumlahUbahJatuhTempo} />
            <Kartu label="Baris tidak bisa diproses" nilai={pratinjau.dilewati.length} />
            <Kartu label="Jatuh tempo mundur" nilai={pratinjau.jumlahMundur} peringatan={pratinjau.jumlahMundur > 0} />
          </div>
          {pratinjau.jumlahMundur > 0 && (
            <p className="text-xs text-amber-700">
              Ada {pratinjau.jumlahMundur} jatuh tempo yang akan menjadi lebih awal dari data aplikasi. Periksa contoh perubahan di bawah sebelum menerapkan.
            </p>
          )}

          <div className="flex flex-col gap-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={catatRealisasi} disabled={sibuk} onChange={(e) => ubahOpsi(e.target.checked, ubahJatuhTempo)} />
              Catat realisasi untuk yang SUDAH DIBAYAR
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={ubahJatuhTempo} disabled={sibuk} onChange={(e) => ubahOpsi(catatRealisasi, e.target.checked)} />
              Ubah jatuh tempo sesuai TG AKHIR PKB
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={terapkan} disabled={!bisaTerapkan} className="btn-primary disabled:opacity-50">
              Terapkan Perubahan
            </button>
            {dilewatiTampil.length > 0 && (
              <button type="button" onClick={() => unduhLaporan(dilewatiTampil)} className="btn-secondary inline-flex items-center gap-1.5">
                <Download size={14} /> Unduh laporan baris dilewati
              </button>
            )}
          </div>

          <Tabel
            judul={`Contoh realisasi yang akan dicatat (maks. 40 dari ${pratinjau.jumlahRealisasi})`}
            kolom={["No. Polisi", "Pemilik", "Tanggal bayar", "Masa akhir"]}
            baris={pratinjau.contohRealisasi.map((r) => [r.nopol, r.pemilik, tgl(r.tanggal_bayar), tgl(r.masa_akhir)])}
          />
          <Tabel
            judul={`Contoh perubahan jatuh tempo (maks. 40 dari ${pratinjau.jumlahUbahJatuhTempo})`}
            kolom={["No. Polisi", "Pemilik", "Jatuh tempo lama", "Jatuh tempo baru", "Status"]}
            baris={pratinjau.contohJatuhTempo.map((r) => [r.nopol, r.pemilik, tgl(r.lama), tgl(r.baru) + (r.mundur ? " ⚠ mundur" : ""), r.status])}
          />
        </div>
      )}

      {!pratinjau && hasil && dilewatiAkhir.length > 0 && (
        <button type="button" onClick={() => unduhLaporan(dilewatiAkhir)} className="btn-secondary inline-flex items-center gap-1.5">
          <Download size={14} /> Unduh laporan baris dilewati
        </button>
      )}
    </div>
  );
}

function Kartu({ label, nilai, peringatan }: { label: string; nilai: number; peringatan?: boolean }) {
  return (
    <div className={`border rounded-lg p-2.5 ${peringatan ? "border-amber-300 bg-amber-50" : "border-line"}`}>
      <p className="text-muted">{label}</p>
      <p className="text-base font-bold">{nilai}</p>
    </div>
  );
}

function Tabel({ judul, kolom, baris }: { judul: string; kolom: string[]; baris: string[][] }) {
  if (baris.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <p className="text-xs font-semibold mb-1">{judul}</p>
      <table className="w-full table-clean text-xs">
        <thead>
          <tr>{kolom.map((k) => <th key={k}>{k}</th>)}</tr>
        </thead>
        <tbody>
          {baris.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
