"use client";

import { useRef, useState } from "react";
import { Upload, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { bacaExcel, kirimJson } from "@/lib/import/baca-excel";
import { bacaSheetBesar } from "@/lib/import/baca-xlsx-besar";
import { BarisNjkb, gabungTanpaDobel, uraikanNjkb } from "@/lib/import/njkb-parse";
import { cellToString } from "@/lib/excel-helpers";

type Jenis = "transaksi" | "njkb" | "master";

const KOLOM_TRANSAKSI: Record<string, string> = {
  no_polisi: "nomor_polisi",
  nm_pemilik: "nm_pemilik",
  tgl_bayar: "tgl_bayar",
  tgl_akhir_pkb: "tgl_akhir_pkb",
  pkb_pokok: "pkb_pokok",
  pkb_opsen_pok: "pkb_opsen_pok",
  bea_swdkllj_pok: "bea_swdkllj_pok",
  kd_jenis_kb: "kd_jenis_kb",
  jumlah_cc: "jumlah_cc",
  kd_plat: "kd_plat",
  no_chasis: "no_chasis",
  kd_merek_kb: "kd_merek_kb",
  tg_awal_stnk: "tg_awal_stnk",
};

const KOLOM_MASTER: Record<string, string> = {
  "nomor polisi": "nomor_polisi",
  "nama pengguna": "nama_pengguna",
  "nama pemilik": "nama_pengguna", // format lama: kolom ini berisi nama pengguna
  "column2": "nama_pemilik",
  "warna plat": "warna_plat",
  "instansi": "instansi",
  "standardized instansi": "standardized_instansi",
  "jenis kendaraan": "jenis_kendaraan",
  "cleaned": "nopol_cleaned",
  "tanggal jatuh tempo": "tanggal_jatuh_tempo",
  "jumlah pkb": "jumlah_pkb",
  "nm_merek_kb": "merk",
  "nm_model_kb": "model",
  "th_rakitan": "tahun",
  "tg_akhir_pkb": "tg_akhir_pkb",
  "tg_bayar": "tg_bayar",
  "bea_pkb_pok": "bea_pkb_pok",
  "kode merk": "kode_merk",
  "kd_merek_kb": "kode_merk",
  "kd_merk_kb": "kode_merk",
  "kd merk": "kode_merk",
  "tanggal awal stnk": "tanggal_awal_stnk",
  "tg_awal_stnk": "tanggal_awal_stnk",
  "kd_jenis_kb": "kode_jenis",
  "jumlah_cc": "cc",
  "kd_plat": "kd_plat",
  "no_chasis": "no_rangka",
  "no rangka": "no_rangka",
};

const UKURAN_POTONGAN = 1000;

export default function ImportBesar({ jenis }: { jenis: Jenis }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [status, setStatus] = useState("");
  const [persen, setPersen] = useState(0);
  const [galat, setGalat] = useState("");
  const [hasil, setHasil] = useState<string[]>([]);
  const [kategori, setKategori] = useState("");

  async function mulai(e: React.FormEvent) {
    e.preventDefault();
    const files = Array.from(inputRef.current?.files ?? []);
    if (files.length === 0) return;
    setSibuk(true);
    setGalat("");
    setHasil([]);
    setPersen(0);
    try {
      if (jenis === "transaksi") await jalankanTransaksi(files);
      else if (jenis === "master") await jalankanMaster(files[0]);
      else await jalankanNjkb(files);
    } catch (err: any) {
      setGalat(err?.message ?? "Terjadi kesalahan");
    } finally {
      setSibuk(false);
      setStatus("");
    }
  }

  async function jalankanTransaksi(files: File[]) {
    const total = { dicocokkan: 0, diabaikan: 0, bayar_baru: 0, belum_balik_nama: 0 };
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      setStatus(`Membaca ${file.name} (${f + 1}/${files.length})... file besar bisa butuh beberapa detik`);
      const [sheet] = await bacaExcel(file, true);
      const aoa = sheet?.baris ?? [];

      // cari baris judul kolom (5 baris pertama)
      let h = -1;
      let peta: Record<number, string> = {};
      for (let r = 0; r < Math.min(5, aoa.length) && h < 0; r++) {
        const p: Record<number, string> = {};
        aoa[r].forEach((v, i) => {
          const k = cellToString(v).toLowerCase();
          if (KOLOM_TRANSAKSI[k]) p[i] = KOLOM_TRANSAKSI[k];
        });
        if (Object.values(p).includes("nomor_polisi")) {
          h = r;
          peta = p;
        }
      }
      if (h < 0) throw new Error(`${file.name}: kolom "no_polisi" tidak ditemukan di baris judul.`);

      const rows: Record<string, unknown>[] = [];
      for (let r = h + 1; r < aoa.length; r++) {
        const rec: Record<string, unknown> = {};
        for (const [i, nama] of Object.entries(peta)) rec[nama] = aoa[r][Number(i)] ?? null;
        if (rec.nomor_polisi) rows.push(rec);
      }
      // urutkan per nopol supaya baris satu kendaraan selalu berada di potongan yang sama
      rows.sort((a, b) => String(a.nomor_polisi).localeCompare(String(b.nomor_polisi)));
      const potongan: Record<string, unknown>[][] = [];
      let sekarang: Record<string, unknown>[] = [];
      rows.forEach((r, i) => {
        sekarang.push(r);
        const berikut = rows[i + 1];
        if (sekarang.length >= UKURAN_POTONGAN && (!berikut || berikut.nomor_polisi !== r.nomor_polisi)) {
          potongan.push(sekarang);
          sekarang = [];
        }
      });
      if (sekarang.length) potongan.push(sekarang);

      let terkirim = 0;
      for (let i = 0; i < potongan.length; i++) {
        setStatus(`${file.name}: mengirim potongan ${i + 1} dari ${potongan.length}`);
        const r = await kirimJson<typeof total>("/api/import/transaksi", { rows: potongan[i] });
        total.dicocokkan += r.dicocokkan;
        total.diabaikan += r.diabaikan;
        total.bayar_baru += r.bayar_baru;
        total.belum_balik_nama += r.belum_balik_nama;
        terkirim += potongan[i].length;
        setPersen(Math.round(((f + terkirim / Math.max(rows.length, 1)) / files.length) * 100));
      }
    }
    await kirimJson("/api/import/transaksi", { selesai: true, nama_file: files.map((x) => x.name).join(", "), total });
    setPersen(100);
    setHasil([
      `${total.dicocokkan} baris cocok dengan database, ${total.bayar_baru} pembayaran baru tercatat.`,
      `${total.diabaikan} baris diabaikan (nopol tidak ada di database, bukan kendaraan ASN terdata).`,
      ...(total.belum_balik_nama > 0 ? [`${total.belum_balik_nama} kendaraan terdeteksi belum balik nama — cek di menu Data Kendaraan.`] : []),
    ]);
  }

  async function jalankanMaster(file: File) {
    if (!kategori) throw new Error("Pilih kategori OPD terlebih dahulu.");
    setStatus(`Membaca ${file.name}... file besar bisa butuh beberapa detik`);
    const pilihSheet = (nama: string[]) => nama.find((x) => /master|clean_datamaster/i.test(x));
    let aoa: unknown[][];
    if (file.size > 30 * 1024 * 1024) {
      // file raksasa (puluhan/ratusan MB): hanya sheet yang dipilih yang dibuka, sheet lain tidak disentuh
      setStatus(`Membuka sheet master dari file besar (${Math.round(file.size / 1048576)} MB)...`);
      aoa = (await bacaSheetBesar(file, pilihSheet)).baris;
    } else {
      const sheets = await bacaExcel(file);
      const sheet = sheets.find((x) => pilihSheet([x.nama])) ?? sheets[0];
      if (!sheet) throw new Error("Sheet tidak ditemukan di file.");
      aoa = sheet.baris;
    }
    const peta: Record<number, string> = {};
    (aoa[0] ?? []).forEach((v, i) => {
      const k = cellToString(v).toLowerCase();
      if (KOLOM_MASTER[k]) peta[i] = KOLOM_MASTER[k];
    });
    if (Object.keys(peta).length === 0) throw new Error("Header kolom tidak dikenali. Pastikan file sesuai format clean_datamaster_smd.");

    const rows: Record<string, unknown>[] = [];
    for (let r = 1; r < aoa.length; r++) {
      const rec: Record<string, unknown> = {};
      for (const [i, nama] of Object.entries(peta)) rec[nama] = aoa[r][Number(i)] ?? null;
      if (rec.nomor_polisi) rows.push(rec);
    }
    if (rows.length === 0) throw new Error("Tidak ada baris data terbaca dari file.");

    const total = { ditambah: 0, diupdate: 0, bayar_baru: 0, opd_baru: 0, tanpa_instansi: 0 };
    for (let i = 0; i < rows.length; i += UKURAN_POTONGAN) {
      setStatus(`Mengirim baris ${Math.min(i + UKURAN_POTONGAN, rows.length).toLocaleString("id-ID")} dari ${rows.length.toLocaleString("id-ID")}`);
      const r = await kirimJson<typeof total>("/api/import/master", { kategori, rows: rows.slice(i, i + UKURAN_POTONGAN) });
      total.ditambah += r.ditambah;
      total.diupdate += r.diupdate;
      total.bayar_baru += r.bayar_baru;
      total.opd_baru += r.opd_baru;
      total.tanpa_instansi += r.tanpa_instansi;
      setPersen(Math.round((Math.min(i + UKURAN_POTONGAN, rows.length) / rows.length) * 95));
    }
    setStatus("Menyelesaikan: menandai kendaraan yang tidak ada di file terbaru...");
    const nopol = rows.map((r) => String(r.nopol_cleaned || r.nomor_polisi));
    const akhir = await kirimJson<{ nonaktif: number }>("/api/import/master", { selesai: true, kategori, nopol, nama_file: file.name, total });
    setPersen(100);
    setHasil([
      `${total.ditambah} kendaraan ditambah, ${total.diupdate} diperbarui, ${total.bayar_baru} pembayaran baru tercatat.`,
      `${akhir.nonaktif} kendaraan ditandai non-aktif (tidak ada di data terbaru).`,
      ...(total.opd_baru > 0 ? [`${total.opd_baru} OPD baru dibuat — cek dan verifikasi di menu Data OPD.`] : []),
      ...(total.tanpa_instansi > 0 ? [`${total.tanpa_instansi} baris dilewati karena kolom instansi kosong.`] : []),
    ]);
  }

  async function jalankanNjkb(files: File[]) {
    const semua: BarisNjkb[] = [];
    const diproses: { nama: string; jumlah: number }[] = [];
    const dilewati: string[] = [];
    for (let f = 0; f < files.length; f++) {
      setStatus(`Membaca ${files[f].name} (${f + 1}/${files.length})...`);
      const sheets = await bacaExcel(files[f]);
      const u = uraikanNjkb(sheets, (s) => (files.length > 1 ? `${files[f].name}:${s}` : s));
      semua.push(...u.hasil);
      diproses.push(...u.diproses);
      dilewati.push(...u.dilewati);
    }
    const baris = gabungTanpaDobel(semua);
    if (baris.length === 0) throw new Error("Tidak ada baris NJKB yang terbaca. Pastikan file sesuai format lampiran NJKB Pergub.");

    setStatus(`Mengosongkan tabel NJKB lama...`);
    await kirimJson("/api/import/njkb", { aksi: "mulai" });
    const UKURAN = 1500;
    for (let i = 0; i < baris.length; i += UKURAN) {
      setStatus(`Menyimpan ${Math.min(i + UKURAN, baris.length).toLocaleString("id-ID")} dari ${baris.length.toLocaleString("id-ID")} baris`);
      await kirimJson("/api/import/njkb", { aksi: "batch", baris: baris.slice(i, i + UKURAN) });
      setPersen(Math.round((Math.min(i + UKURAN, baris.length) / baris.length) * 100));
    }
    await kirimJson("/api/import/njkb", {
      aksi: "selesai",
      jumlah: baris.length,
      nama_file: files.map((x) => x.name).join(", "),
      ringkasan: diproses.map((s) => `${s.nama}: ${s.jumlah}`).join(", "),
      dilewati: dilewati.join(", ") || "-",
    });
    setHasil([
      `${baris.length.toLocaleString("id-ID")} baris NJKB tersimpan dari ${diproses.length} sheet.`,
      ...(dilewati.length ? [`Sheet dilewati: ${dilewati.join(", ")}`] : []),
      "Pokok PKB kendaraan otomatis terhitung ulang berdasarkan tabel ini.",
    ]);
  }

  return (
    <form onSubmit={mulai} className="space-y-3">
      {jenis === "master" && (
        <div>
          <label className="text-xs text-muted block mb-1">Kategori OPD pada file ini</label>
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} required disabled={sibuk} className="text-sm border border-line rounded-lg px-3 py-2 w-full bg-white">
            <option value="">Pilih kategori...</option>
            <option value="Pemerintah Kota Samarinda">Pemerintah Kota Samarinda</option>
            <option value="Pemerintah Provinsi Kalimantan Timur">Pemerintah Provinsi Kalimantan Timur</option>
          </select>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple={jenis !== "master"} className="text-sm w-full" required disabled={sibuk} />
      {jenis === "njkb" && (
        <p className="text-[11px] text-muted">Tahan tombol Ctrl (atau Cmd di Mac) saat memilih file untuk upload lebih dari satu file sekaligus.</p>
      )}
      <button className="btn-primary disabled:opacity-60" disabled={sibuk}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        {sibuk ? "Memproses..." : jenis === "njkb" ? "Import tabel NJKB" : jenis === "master" ? "Import master" : "Import"}
      </button>

      {sibuk && (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-primary-100 overflow-hidden">
            <div className="h-full bg-primary-600 transition-all duration-300" style={{ width: `${persen}%` }} />
          </div>
          <p className="text-xs text-muted break-words">{status} {persen > 0 && `(${persen}%)`}</p>
          <p className="text-[11px] text-muted">Jangan tutup atau pindah halaman sampai selesai.</p>
        </div>
      )}

      {galat && (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">
            <p className="font-medium">Import terhenti.</p>
            <p className="text-xs">{galat}</p>
            <p className="text-xs mt-1">Aman diulang: data yang sudah masuk tidak akan tercatat dobel.</p>
          </div>
        </div>
      )}

      {hasil.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
          <div className="min-w-0 break-words">
            <p className="font-medium">Import selesai.</p>
            {hasil.map((h) => (
              <p key={h} className="text-xs">{h}</p>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
