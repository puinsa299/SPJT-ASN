// Import Hasil Cek SPJT/STPD (file HASIL_CEK dari pengecekan ke SIMPATOR).
// Berisi fungsi murni (tanpa akses database) supaya bisa dipakai di browser dan server serta mudah diuji.
import { normalizeNopol } from "@/lib/nopol";

export const STATUS_DIKENAL = [
  "SESUAI",
  "SUDAH DIBAYAR",
  "BAYAR SEBAGIAN",
  "TANGGAL BERBEDA",
  "DATA BERBEDA",
  "TIDAK DITEMUKAN",
  "GAGAL DIPROSES",
  "TIDAK DICEK",
  "GANTI NOPOL",
] as const;
const STATUS_DILEWATI = ["TIDAK DITEMUKAN", "GAGAL DIPROSES", "TIDAK DICEK", "GANTI NOPOL"];

export type BarisHasilCek = {
  baris: number; // nomor baris di Excel (untuk laporan)
  surat: string;
  nopol: string;
  status: string;
  tgAkhir: string | null; // yyyy-mm-dd, null = kosong/tidak terbaca
  tgAkhirMentah: string;
  tgBayar: string | null;
  tgBayarMentah: string;
  perubahan: string;
};

// ---------------------------------------------------------------- tanggal
const BULAN: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2, pebruari: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agus: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, october: 10,
  nov: 11, nop: 11, november: 11, nopember: 11,
  des: 12, dec: 12, desember: 12, december: 12,
};

function rakitTanggal(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // mis. 31 Feb
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Mengembalikan yyyy-mm-dd atau null (kosong / tidak valid)
export function parseTanggal(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : rakitTanggal(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number") {
    if (!isFinite(v) || v < 20000 || v > 80000) return null; // di luar kisaran serial tanggal Excel yang wajar
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return rakitTanggal(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/);
  if (m) return rakitTanggal(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) return rakitTanggal(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2})[ \-\/.]([A-Za-z]+)\.?[ \-\/.,]*(\d{2,4})$/);
  if (m) {
    const bln = BULAN[m[2].toLowerCase()];
    if (!bln) return null;
    return rakitTanggal(m[3].length === 2 ? 2000 + +m[3] : +m[3], bln, +m[1]);
  }
  return null;
}

// ---------------------------------------------------------------- membaca sheet
export const samakanJudul = (v: unknown) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const ALIAS: Record<string, string> = {
  nopol: "nopol", no_polisi: "nopol", nomor_polisi: "nopol", no_pol: "nopol",
  status: "status",
  surat: "surat",
  tg_akhir_pkb: "tgAkhir", tgl_akhir_pkb: "tgAkhir", tanggal_akhir_pkb: "tgAkhir",
  tg_bayar: "tgBayar", tgl_bayar: "tgBayar", tanggal_bayar: "tgBayar",
  perubahan: "perubahan",
};

export type HasilBaca = { ok: true; baris: BarisHasilCek[]; kosong: number } | { ok: false; pesan: string };

// sheets: [{nama, baris: unknown[][]}] — dipakai sheet "HASIL" bila ada, jika tidak sheet pertama.
export function bacaHasilCek(sheets: { nama: string; baris: unknown[][] }[]): HasilBaca {
  if (!sheets.length) return { ok: false, pesan: "File tidak berisi sheet." };
  const sheet = sheets.find((s) => s.nama.trim().toUpperCase() === "HASIL") ?? sheets[0];
  // cari baris judul dalam 10 baris pertama
  let idxJudul = -1;
  let peta: Record<string, number> = {};
  for (let i = 0; i < Math.min(10, sheet.baris.length); i++) {
    const p: Record<string, number> = {};
    (sheet.baris[i] ?? []).forEach((c, j) => {
      const k = ALIAS[samakanJudul(c)];
      if (k && p[k] === undefined) p[k] = j;
    });
    if (p.nopol !== undefined && p.status !== undefined) {
      idxJudul = i;
      peta = p;
      break;
    }
  }
  if (idxJudul < 0) {
    const judul = (sheet.baris[0] ?? []).map((c) => String(c ?? "").trim()).filter(Boolean).join(", ") || "(kosong)";
    return {
      ok: false,
      pesan: `Kolom wajib NOPOL dan Status tidak ditemukan pada sheet "${sheet.nama}". Judul kolom yang terbaca: ${judul}. Pastikan ini file HASIL_CEK.`,
    };
  }
  const baris: BarisHasilCek[] = [];
  let kosong = 0;
  for (let i = idxJudul + 1; i < sheet.baris.length; i++) {
    const r = sheet.baris[i] ?? [];
    const ambil = (k: string) => (peta[k] === undefined ? null : r[peta[k]] ?? null);
    const nopol = String(ambil("nopol") ?? "").trim();
    const status = String(ambil("status") ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    if (!nopol && !status) {
      kosong++;
      continue;
    }
    const mentah = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v).trim());
    baris.push({
      baris: i + 1,
      surat: String(ambil("surat") ?? "").trim(),
      nopol,
      status,
      tgAkhir: parseTanggal(ambil("tgAkhir")),
      tgAkhirMentah: mentah(ambil("tgAkhir")),
      tgBayar: parseTanggal(ambil("tgBayar")),
      tgBayarMentah: mentah(ambil("tgBayar")),
      perubahan: String(ambil("perubahan") ?? "").trim(),
    });
  }
  return { ok: true, baris, kosong };
}

// ---------------------------------------------------------------- rencana
export type KendaraanRingkas = {
  id: string;
  nomor_polisi_display: string;
  nama_pemilik: string | null;
  nama_pengguna: string | null;
  jatuh_tempo: string | null;
  plat: string;
  status: string;
};
export type TransaksiRingkas = { kendaraan_id: string; tanggal_bayar: string; sumber: string | null };

export type Realisasi = { kendaraan_id: string; nopol: string; pemilik: string; tanggal_bayar: string; masa_akhir: string; status: string };
export type UbahJatuhTempo = { kendaraan_id: string; nopol: string; pemilik: string; lama: string | null; baru: string; status: string; mundur: boolean };
export type Dilewati = { nopol: string; surat: string; status: string; alasan: string; keterangan: string };

export type Rencana = {
  perStatus: Record<string, number>;
  realisasi: Realisasi[];
  ubahJatuhTempo: UbahJatuhTempo[];
  sudahTercatat: number; // SUDAH DIBAYAR yang realisasinya sudah ada (tidak dobel)
  dilewati: Dilewati[];
};

export type OpsiHasilCek = { realisasi: boolean; jatuhTempo: boolean };

export function rencanakan(
  rows: BarisHasilCek[],
  kendaraan: Map<string, KendaraanRingkas>, // kunci: nopol ternormalisasi
  transaksi: TransaksiRingkas[],
  opsi: OpsiHasilCek,
  hariIni: string
): Rencana {
  const hasil: Rencana = { perStatus: {}, realisasi: [], ubahJatuhTempo: [], sudahTercatat: 0, dilewati: [] };
  const adaBayar = new Set(transaksi.map((t) => `${t.kendaraan_id}|${t.tanggal_bayar}`));
  const jtSaatIni = new Map<string, string | null>(); // keadaan berjalan bila nopol yang sama muncul lebih dari sekali
  const lewati = (r: BarisHasilCek, alasan: string, keterangan = "") =>
    hasil.dilewati.push({ nopol: r.nopol, surat: r.surat, status: r.status, alasan, keterangan });

  for (const r of rows) {
    hasil.perStatus[r.status || "(kosong)"] = (hasil.perStatus[r.status || "(kosong)"] ?? 0) + 1;

    if (!(STATUS_DIKENAL as readonly string[]).includes(r.status)) {
      lewati(r, "Status tidak dikenal", r.status);
      continue;
    }
    if (STATUS_DILEWATI.includes(r.status)) {
      lewati(
        r,
        r.status === "GANTI NOPOL" ? "Ganti nopol, perlu dicek manual" : `Status ${r.status}`,
        r.status === "GANTI NOPOL" ? `Pembayaran bisa tercatat di nopol baru. ${r.perubahan}`.trim() : r.perubahan
      );
      continue;
    }
    const kunci = normalizeNopol(r.nopol);
    if (!kunci) {
      lewati(r, "NOPOL kosong");
      continue;
    }
    const k = kendaraan.get(kunci);
    if (!k) {
      lewati(r, "Nopol tidak ada di aplikasi", "Tidak dibuat baru");
      continue;
    }
    if (k.status !== "Aktif") {
      lewati(r, `Kendaraan berstatus ${k.status}`, "Tidak diubah");
      continue;
    }
    const pemilik = k.nama_pengguna || k.nama_pemilik || "";
    const sekarang = jtSaatIni.has(k.id) ? jtSaatIni.get(k.id)! : k.jatuh_tempo;

    // tanggal wajib per status
    const perluAkhir = true;
    if (perluAkhir && !r.tgAkhir) {
      lewati(r, "TG AKHIR PKB kosong/tidak terbaca", r.tgAkhirMentah);
      continue;
    }

    if (r.status === "SUDAH DIBAYAR") {
      if (!r.tgBayar) {
        lewati(r, "TG BAYAR kosong/tidak terbaca", r.tgBayarMentah);
        continue;
      }
      if (r.tgBayar > hariIni) {
        lewati(r, "TG BAYAR lebih baru dari hari ini", r.tgBayarMentah);
        continue;
      }
      if (opsi.realisasi) {
        const kk = `${k.id}|${r.tgBayar}`;
        if (adaBayar.has(kk)) hasil.sudahTercatat++;
        else {
          adaBayar.add(kk);
          hasil.realisasi.push({ kendaraan_id: k.id, nopol: k.nomor_polisi_display, pemilik, tanggal_bayar: r.tgBayar, masa_akhir: r.tgAkhir!, status: r.status });
        }
      }
    }

    // jatuh tempo: semua status yang tidak dilewati
    if (opsi.jatuhTempo && r.tgAkhir !== sekarang) {
      if (k.plat !== "KT") {
        lewati(r, "Plat luar daerah, jatuh tempo tidak diubah");
      } else {
        hasil.ubahJatuhTempo.push({
          kendaraan_id: k.id,
          nopol: k.nomor_polisi_display,
          pemilik,
          lama: sekarang,
          baru: r.tgAkhir!,
          status: r.status,
          mundur: !!sekarang && r.tgAkhir! < sekarang,
        });
        jtSaatIni.set(k.id, r.tgAkhir!);
      }
    }
  }
  return hasil;
}

// Satu nopol bisa muncul beberapa kali; hanya perubahan terakhir per kendaraan yang perlu ditulis ke database.
export function jatuhTempoAkhir(u: UbahJatuhTempo[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of u) m.set(x.kendaraan_id, x.baru);
  return m;
}
