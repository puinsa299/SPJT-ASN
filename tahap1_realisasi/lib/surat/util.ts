// Fungsi bersama untuk surat SPJT/STPD (dipakai Word dan PDF, supaya isinya identik).

export type JenisSurat = "SPJT" | "STPD";

export type BarisLampiran = {
  nopol: string;
  nama: string;
  rangka: string;
  jatuhTempo: string | null; // yyyy-mm-dd
  pokok: number;
  dendaPkb: number;
  sanksi: number;
  opsen: number;
  dendaOpsen: number;
  swdkllj: number;
  dendaSwdkllj: number;
  stnk: number;
  plat: number;
  total: number;
};

export type SetelanSurat = {
  kota: string;
  sifat: string;
  paragraf: string[]; // 2 atau lebih paragraf isi
  penutup: string;
  jabatan: string;
  namaPejabat: string;
  nip: string;
  batasHari: number;
  lampiranRincian: boolean;
};

export type InfoPemutihan = {
  nama: string;
  mulai: string; // yyyy-mm-dd
  selesai: string;
  totalPotongan: number;
} | null;

export type SuratData = {
  jenis: JenisSurat;
  instansi: string;
  tanggal: Date;
  setelan: SetelanSurat;
  baris: BarisLampiran[];
  pemutihan: InfoPemutihan;
  lembarLampiran: number;
};

// ---------------------------------------------------------------------------
// Terbilang (Indonesia), cukup sampai ribuan -- dipakai untuk "4 (empat) lembar"
// dan "14 (empat belas) hari kalender".
// ---------------------------------------------------------------------------
const SATUAN = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];

export function terbilang(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "nol";
  const f = (x: number): string => {
    if (x < 12) return SATUAN[x];
    if (x < 20) return `${SATUAN[x - 10]} belas`;
    if (x < 100) return `${SATUAN[Math.floor(x / 10)]} puluh${x % 10 ? " " + SATUAN[x % 10] : ""}`;
    if (x < 200) return `seratus${x % 100 ? " " + f(x % 100) : ""}`;
    if (x < 1000) return `${SATUAN[Math.floor(x / 100)]} ratus${x % 100 ? " " + f(x % 100) : ""}`;
    if (x < 2000) return `seribu${x % 1000 ? " " + f(x % 1000) : ""}`;
    if (x < 1_000_000) return `${f(Math.floor(x / 1000))} ribu${x % 1000 ? " " + f(x % 1000) : ""}`;
    return String(x);
  };
  return f(n);
}

export const angkaDenganHuruf = (n: number) => `${n} (${terbilang(n)})`;

// ---------------------------------------------------------------------------
// Format angka & tanggal
// ---------------------------------------------------------------------------
export function rp(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  if (!v) return "-";
  return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function tanggalPanjang(d: Date | string | null | undefined): string {
  if (!d) return "-";
  const x = typeof d === "string" ? new Date(d + (d.length <= 10 ? "T00:00:00" : "")) : d;
  if (Number.isNaN(x.getTime())) return "-";
  return `${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Nilai bawaan setelan surat. Kolom kosong di Pengaturan -> kembali ke nilai ini.
// Placeholder di teks: {instansi}, {batas_hari}  (juga ${nama_opd} dari versi lama)
// Kode SRIKANDI (${nomor_naskah}, ${hal}, ${ttd_pengirim}, ${nama_pengirim}) sengaja
// dicetak apa adanya.
// ---------------------------------------------------------------------------
export const SETELAN_BAWAAN: Record<JenisSurat, SetelanSurat> = {
  SPJT: {
    kota: "Samarinda",
    sifat: "${sifat}",
    paragraf: [
      "Berdasarkan basis data yang disampaikan oleh Badan Pengelola Keuangan dan Aset Daerah Pemerintah Kota Samarinda, berikut kami sampaikan daftar kendaraan yang tercatat digunakan oleh {instansi} sebagaimana terlampir.",
      "Sehubungan dengan hal tersebut, kami mohon agar Saudara dapat melakukan konfirmasi dan verifikasi terhadap data dimaksud, meliputi status kepemilikan dan penggunaan kendaraan serta status pembayaran Pajak Kendaraan Bermotor (PKB) atas masing-masing kendaraan. Apabila kendaraan tersebut masih dimiliki atau dikuasai oleh instansi Saudara dan masih terdapat tunggakan pajak, kami mohon agar tunggakan tersebut dapat dilunasi paling lambat {batas_hari} hari kalender sejak surat ini diterima. Hasil konfirmasi dan verifikasi agar disampaikan kepada UPTD PPRD Wilayah Samarinda sebagai bahan pemutakhiran data dan tindak lanjut pengawasan kepatuhan pajak kendaraan dinas.",
    ],
    penutup: "Demikian surat ini kami sampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.",
    jabatan: "Kepala,",
    namaPejabat: "${nama_pengirim}",
    nip: "197204111996032005",
    batasHari: 14,
    lampiranRincian: true,
  },
  STPD: {
    kota: "Samarinda",
    sifat: "${sifat}",
    paragraf: [
      "Berdasarkan basis data yang disampaikan oleh Badan Pengelola Keuangan dan Aset Daerah Pemerintah Kota Samarinda, kendaraan yang tercatat digunakan oleh {instansi} sebagaimana terlampir masih memiliki tunggakan Pajak Kendaraan Bermotor (PKB).",
      "Sehubungan dengan hal tersebut, kami sampaikan tagihan atas tunggakan pajak beserta komponen pendukungnya sebagaimana rincian pada lampiran, dan mohon agar tagihan tersebut dapat dilunasi paling lambat {batas_hari} hari kalender sejak surat ini diterima. Apabila kendaraan tersebut sudah tidak dimiliki atau dikuasai oleh instansi Saudara, mohon disampaikan keterangan tertulis kepada UPTD PPRD Wilayah Samarinda sebagai bahan pemutakhiran data.",
    ],
    penutup: "Demikian surat ini kami sampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.",
    jabatan: "Kepala,",
    namaPejabat: "${nama_pengirim}",
    nip: "197204111996032005",
    batasHari: 14,
    lampiranRincian: true,
  },
};

type RowPengaturan = Partial<{
  kota: string | null;
  sifat: string | null;
  paragraf1: string | null;
  paragraf2: string | null;
  paragraf3: string | null;
  penutup: string | null;
  jabatan: string | null;
  nama_pejabat: string | null;
  nip: string | null;
  batas_hari: number | null;
  lampiran_rincian: boolean | null;
}>;

const isi = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

// Gabungkan baris pengaturan dari database dengan nilai bawaan (kolom kosong -> bawaan).
export function gabungSetelan(jenis: JenisSurat, row: RowPengaturan | null | undefined): SetelanSurat {
  const b = SETELAN_BAWAAN[jenis];
  const p1 = isi(row?.paragraf1);
  const p2 = isi(row?.paragraf2);
  const p3 = isi(row?.paragraf3);
  const paragraf = [p1 ?? b.paragraf[0], p2 ?? b.paragraf[1]];
  if (p3) paragraf.push(p3);
  return {
    kota: isi(row?.kota) ?? b.kota,
    sifat: isi(row?.sifat) ?? b.sifat,
    paragraf,
    penutup: isi(row?.penutup) ?? b.penutup,
    jabatan: isi(row?.jabatan) ?? b.jabatan,
    namaPejabat: isi(row?.nama_pejabat) ?? b.namaPejabat,
    nip: isi(row?.nip) ?? b.nip,
    batasHari: row?.batas_hari && row.batas_hari > 0 ? row.batas_hari : b.batasHari,
    lampiranRincian: row?.lampiran_rincian ?? b.lampiranRincian,
  };
}

// Ganti placeholder di teks paragraf.
export function isiTeks(teks: string, instansi: string, batasHari: number): string {
  return teks
    .replaceAll("{instansi}", instansi)
    .replaceAll("${nama_opd}", instansi)
    .replaceAll("{batas_hari}", angkaDenganHuruf(batasHari));
}

// ---------------------------------------------------------------------------
// Kolom lampiran (urutan dan penulisan persis sesuai ketentuan)
// Lebar dalam cm; total = 26,7 cm (lebar kerja halaman A4 mendatar, margin 1,5 cm).
// ---------------------------------------------------------------------------
export type Kolom = {
  key: keyof BarisLampiran | "no";
  label: string;
  cm: number;
  align: "center" | "left" | "right";
  numeric?: boolean;
};

export const LEBAR_KERJA_CM = 26.7;

const KOLOM_PENUH: Kolom[] = [
  { key: "no", label: "No", cm: 0.7, align: "center" },
  { key: "nopol", label: "Nopol di Samsat", cm: 2.0, align: "left" },
  { key: "nama", label: "Nama di Samsat", cm: 2.8, align: "left" },
  { key: "rangka", label: "No Rangka", cm: 2.9, align: "left" },
  { key: "jatuhTempo", label: "Jatuh Tempo", cm: 2.3, align: "center" },
  { key: "pokok", label: "Pokok PKB", cm: 1.9, align: "right", numeric: true },
  { key: "dendaPkb", label: "Denda PKB", cm: 1.8, align: "right", numeric: true },
  { key: "sanksi", label: "Sanksi Adm", cm: 1.3, align: "right", numeric: true },
  { key: "opsen", label: "Opsen PKB", cm: 1.7, align: "right", numeric: true },
  { key: "dendaOpsen", label: "Denda Opsen", cm: 1.5, align: "right", numeric: true },
  { key: "swdkllj", label: "SWDKLLJ", cm: 1.5, align: "right", numeric: true },
  { key: "dendaSwdkllj", label: "Denda SWDKLLJ", cm: 1.5, align: "right", numeric: true },
  { key: "stnk", label: "STNK", cm: 1.4, align: "right", numeric: true },
  { key: "plat", label: "Plat", cm: 1.3, align: "right", numeric: true },
  { key: "total", label: "Total", cm: 2.1, align: "right", numeric: true },
];

export function kolomLampiran(rincian: boolean): Kolom[] {
  if (rincian) return KOLOM_PENUH;
  // Tanpa rincian tagihan: 5 kolom pertama saja, diperlebar memenuhi lebar halaman.
  const dasar = KOLOM_PENUH.slice(0, 5);
  const rasio = [0.06, 0.17, 0.33, 0.28, 0.16];
  return dasar.map((k, i) => ({ ...k, cm: +(LEBAR_KERJA_CM * rasio[i]).toFixed(2) }));
}

export function nilaiSel(k: Kolom, b: BarisLampiran, i: number): string {
  if (k.key === "no") return String(i + 1);
  if (k.key === "jatuhTempo") return b.jatuhTempo ? tanggalPanjang(b.jatuhTempo) : "-";
  if (k.numeric) return rp(b[k.key] as number);
  return String(b[k.key] ?? "") || "-";
}

export function totalKolom(baris: BarisLampiran[]): Record<string, number> {
  const t: Record<string, number> = {};
  for (const k of KOLOM_PENUH) if (k.numeric) t[k.key as string] = baris.reduce((a, b) => a + Number(b[k.key as keyof BarisLampiran] ?? 0), 0);
  return t;
}

export function catatanPemutihan(p: NonNullable<InfoPemutihan>): string {
  return `Perhitungan pada lampiran ini memakai program ${p.nama}, berlaku ${tanggalPanjang(p.mulai)} s.d. ${tanggalPanjang(p.selesai)}. Total potongan pemutihan: Rp ${rp(p.totalPotongan)}.`;
}

export function namaBerkas(jenis: JenisSurat, instansi: string, ext: "docx" | "pdf"): string {
  const aman = instansi.replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "") || "Instansi";
  return `${jenis}_${aman}.${ext}`;
}
