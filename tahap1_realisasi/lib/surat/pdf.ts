import { readFileSync } from "fs";
import { join } from "path";
import {
  SuratData,
  catatanPemutihan,
  isiTeks,
  kolomLampiran,
  nilaiSel,
  rp,
  tanggalPanjang,
  totalKolom,
  angkaDenganHuruf,
} from "./util";

// PDF dibuat langsung di server (tanpa dialog cetak browser), dengan tata letak yang
// sama seperti berkas Word. Font: Liberation Sans (metrik identik dengan Arial) dilampirkan
// di assets/fonts supaya hasilnya sama di mesin mana pun.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PdfPrinter = require("pdfmake");

const PT = 28.3465; // 1 cm dalam poin
const cm = (v: number) => v * PT;

const fontDir = () => join(process.cwd(), "assets", "fonts");
const fonts = () => ({
  Arial: {
    normal: join(fontDir(), "LiberationSans-Regular.ttf"),
    bold: join(fontDir(), "LiberationSans-Bold.ttf"),
    italics: join(fontDir(), "LiberationSans-Italic.ttf"),
    bolditalics: join(fontDir(), "LiberationSans-BoldItalic.ttf"),
  },
});

// Margin dokumen = margin lampiran (pdfmake hanya mengenal satu margin untuk seluruh dokumen).
// Halaman surat diberi selisih margin lewat `margin` pada isinya (atas 3,97 cm, kiri 2 cm,
// kanan 1,84 cm; bawah 2,54 cm dijaga karena isi surat selalu muat satu halaman).
const M = { top: cm(2), bottom: cm(2), left: cm(1.5), right: cm(1.5) };
const A4 = { w: 595.28, h: 841.89 };

export type HasilPdf = { buffer: Buffer; lembarLampiran: number };

function susunDokumen(d: SuratData) {
  const s = d.setelan;
  const kop = readFileSync(join(process.cwd(), "assets", "kop-surat.jpeg"));
  const kopLebar = cm(15.9);
  const kopX = (A4.w - kopLebar) / 2;

  const teks = (text: string, extra: Record<string, unknown> = {}) => ({
    text: text === "" ? " " : text,
    fontSize: 12,
    lineHeight: 1.15,
    ...extra,
  });

  const baris = (label: string, nilai: string) => ({
    columns: [
      { width: cm(1.905), ...teks(label) }, // tab 1080 twips
      { width: cm(0.317), ...teks(":") }, // 1260 - 1080 twips
      { width: "*", ...teks(nilai) },
    ],
    columnGap: 0,
  });

  const isiParagraf = [...s.paragraf.map((t) => isiTeks(t, d.instansi, s.batasHari)), s.penutup];
  const SIG = cm(10.25);

  const surat = {
    margin: [cm(0.5), cm(3.97) - M.top, cm(0.34), 0],
    stack: [
      teks(`${s.kota}, ${tanggalPanjang(d.tanggal)}`, { alignment: "right", margin: [0, 0, 0, 12] }),
      baris("Nomor", "${nomor_naskah}"),
      baris("Sifat", s.sifat),
      baris("Lampiran", `${angkaDenganHuruf(d.lembarLampiran)} lembar`),
      baris("Hal", "${hal}"),
      teks(""),
      teks(`Yth. Pimpinan ${d.instansi}`),
      teks("di –", { margin: [0, 12, 0, 0] }),
      teks("Tempat", { margin: [cm(1.27), 0, 0, 12] }),
      ...isiParagraf.map((t) => teks(t, { alignment: "justify", leadingIndent: cm(1.25) })),
      teks(""),
      {
        unbreakable: true,
        stack: [
          teks(s.jabatan, { margin: [SIG, 0, 0, 0] }),
          teks("", { margin: [SIG, 0, 0, 0] }),
          teks("${ttd_pengirim}", { margin: [SIG, 0, 0, 0] }),
          teks("", { margin: [SIG, 0, 0, 0] }),
          teks(s.namaPejabat, { margin: [SIG, 0, 0, 0] }),
          teks(`NIP ${s.nip}`, { margin: [SIG, 0, 0, 0] }),
        ],
      },
    ],
  };

  // ---------------- lampiran mendatar ----------------
  const kolom = kolomLampiran(s.lampiranRincian);
  const skala = 0.9995; // jaga-jaga pembulatan supaya tidak melebihi lebar halaman
  // lebar kolom pdfmake TIDAK termasuk padding, jadi padding kiri+kanan (5 pt) dikurangi
  const widths = kolom.map((k) => cm(k.cm) * skala - 5);
  const SZ = 7;
  const sel = (text: string, o: { bold?: boolean; fill?: string; align?: string; span?: number } = {}) => ({
    text,
    fontSize: SZ,
    lineHeight: 1,
    bold: o.bold,
    fillColor: o.fill,
    alignment: o.align ?? "left",
    colSpan: o.span,
  });
  const kosongSel = { text: "" };

  const judulTabel = kolom.map((k) => sel(k.label, { bold: true, fill: "#D9E2F3", align: "center" }));
  const dataTabel = d.baris.map((b, n) => kolom.map((k) => sel(nilaiSel(k, b, n), { align: k.align })));
  const tot = totalKolom(d.baris);
  const jumlah = s.lampiranRincian
    ? [
        sel("Jumlah", { bold: true, align: "center", span: 5 }),
        kosongSel,
        kosongSel,
        kosongSel,
        kosongSel,
        ...kolom.slice(5).map((k) => sel(rp(tot[k.key as string]), { bold: true, align: "right" })),
      ]
    : [sel(`Jumlah: ${d.baris.length} kendaraan`, { bold: true, align: "center", span: kolom.length }), ...kolom.slice(1).map(() => kosongSel)];

  const lampiran: any[] = [
    {
      pageBreak: "before",
      pageOrientation: "landscape",
      text: "DAFTAR KENDARAAN JATUH TEMPO PAJAK KENDARAAN BERMOTOR",
      bold: true,
      fontSize: 10,
      alignment: "center",
    },
    { text: `a.n. ${d.instansi}`, bold: true, fontSize: 10, alignment: "center", margin: [0, 0, 0, 8] },
    {
      table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths, body: [judulTabel, ...dataTabel, jumlah] },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => "#000000",
        vLineColor: () => "#000000",
        paddingLeft: () => 2.5,
        paddingRight: () => 2.5,
        paddingTop: () => 1.5,
        paddingBottom: () => 1.5,
      },
    },
  ];
  if (d.pemutihan) {
    lampiran.push({ text: catatanPemutihan(d.pemutihan), italics: true, fontSize: 8, margin: [0, 6, 0, 0] });
  }

  const orientasi: Record<number, string> = {};

  const definisi = {
    pageSize: "A4",
    pageMargins: [M.left, M.top, M.right, M.bottom],
    info: { title: `${d.jenis} ${d.instansi}`, author: "UPTD PPRD Wilayah Samarinda" },
    defaultStyle: { font: "Arial", fontSize: 12 },
    background: (halaman: number) =>
      halaman === 1 ? { image: kopDataUri(kop), width: kopLebar, absolutePosition: { x: kopX, y: cm(1.25) } } : null,
    // dipakai hanya untuk mencatat orientasi tiap halaman (menghitung jumlah halaman lampiran)
    footer: (halaman: number, _total: number, ukuran: { orientation: string }) => {
      orientasi[halaman] = ukuran.orientation;
      return null;
    },
    content: [surat, ...lampiran],
  };

  return { definisi, orientasi };
}

function kopDataUri(buf: Buffer) {
  return "data:image/jpeg;base64," + buf.toString("base64");
}

export async function buatPdf(d: SuratData): Promise<HasilPdf> {
  const { definisi, orientasi } = susunDokumen(d);
  const printer = new PdfPrinter(fonts());
  const doc = printer.createPdfKitDocument(definisi);
  const potongan: Buffer[] = [];
  const buffer: Buffer = await new Promise((resolve, reject) => {
    doc.on("data", (c: Buffer) => potongan.push(c));
    doc.on("end", () => resolve(Buffer.concat(potongan)));
    doc.on("error", reject);
    doc.end();
  });
  const lembarLampiran = Object.values(orientasi).filter((o) => o === "landscape").length;
  return { buffer, lembarLampiran };
}

// Hitung jumlah halaman lampiran yang sebenarnya (dari tata letak PDF), dipakai untuk
// tulisan "Lampiran : 4 (empat) lembar" baik di Word maupun PDF.
export async function hitungLembarLampiran(d: SuratData): Promise<number> {
  const hasil = await buatPdf({ ...d, lembarLampiran: 1 });
  return Math.max(1, hasil.lembarLampiran);
}
