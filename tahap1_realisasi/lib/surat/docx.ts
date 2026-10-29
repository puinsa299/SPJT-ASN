import { readFileSync } from "fs";
import { join } from "path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
  HorizontalPositionAlign,
  HorizontalPositionRelativeFrom,
  ImageRun,
  LineRuleType,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TabStopType,
  TextRun,
  TextWrappingType,
  VerticalAlign,
  VerticalPositionRelativeFrom,
  WidthType,
} from "docx";
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

const FONT = "Arial";
const cm = (v: number) => Math.round(v * 566.929);

// Ukuran halaman & margin sesuai ketentuan
const SURAT = { top: cm(3.97), bottom: cm(2.54), left: cm(2), right: cm(1.84) };
const LAMPIRAN = { top: cm(2), bottom: cm(2), left: cm(1.5), right: cm(1.5) };

const garis = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const borders = { top: garis, bottom: garis, left: garis, right: garis };

function p12(text: string, opts: Record<string, unknown> = {}) {
  return new Paragraph({
    spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 0 },
    ...(opts as object),
    children: [new TextRun({ text, size: 24, font: FONT })],
  });
}

export async function buatDocx(d: SuratData): Promise<Buffer> {
  const s = d.setelan;
  const kop = readFileSync(join(process.cwd(), "assets", "kop-surat.jpeg"));

  // ---------------- Halaman surat ----------------
  const tab = [
    { type: TabStopType.LEFT, position: 1080 },
    { type: TabStopType.LEFT, position: 1260 },
  ];
  const baris = (label: string, nilai: string) =>
    new Paragraph({
      tabStops: tab,
      spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 0 },
      children: [new TextRun({ text: `${label}\t:\t${nilai}`, size: 24, font: FONT })],
    });

  const paragrafIsi = [...s.paragraf.map((t) => isiTeks(t, d.instansi, s.batasHari)), s.penutup];
  const SIG = 5812; // indent blok tanda tangan (twips)
  const kosong = () => p12("", { keepNext: true });

  const halamanSurat = [
    p12(`${s.kota}, ${tanggalPanjang(d.tanggal)}`, { alignment: AlignmentType.RIGHT, spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 240 } }),
    baris("Nomor", "${nomor_naskah}"),
    baris("Sifat", s.sifat),
    baris("Lampiran", `${angkaDenganHuruf(d.lembarLampiran)} lembar`),
    baris("Hal", "${hal}"),
    p12("", {}),
    p12(`Yth. Pimpinan ${d.instansi}`),
    p12("di –", { spacing: { line: 276, lineRule: LineRuleType.AUTO, before: 240, after: 0 } }),
    new Paragraph({
      tabStops: [{ type: TabStopType.LEFT, position: 720 }],
      spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 240 },
      children: [new TextRun({ text: "\tTempat", size: 24, font: FONT })],
    }),
    ...paragrafIsi.map((t) =>
      p12(t, { alignment: AlignmentType.JUSTIFIED, indent: { firstLine: cm(1.25) }, spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 0 } })
    ),
    p12("", { keepNext: true }),
    p12(s.jabatan, { indent: { left: SIG }, keepNext: true, keepLines: true }),
    kosong(),
    p12("${ttd_pengirim}", { indent: { left: SIG }, keepNext: true, keepLines: true }),
    kosong(),
    p12(s.namaPejabat, { indent: { left: SIG }, keepNext: true, keepLines: true }),
    p12(`NIP ${s.nip}`, { indent: { left: SIG }, keepLines: true }),
  ];

  // ---------------- Lampiran (mendatar) ----------------
  const kolom = kolomLampiran(s.lampiranRincian);
  const lebar = kolom.map((k) => cm(k.cm));
  const lebarTotal = lebar.reduce((a, b) => a + b, 0);
  const SZ = 14; // 7 pt (setengah poin)

  const sel = (text: string, i: number, opts: { bold?: boolean; fill?: string; align?: "center" | "left" | "right"; span?: number; widthTwip?: number } = {}) =>
    new TableCell({
      width: { size: opts.widthTwip ?? lebar[i], type: WidthType.DXA },
      columnSpan: opts.span,
      borders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 30, bottom: 30, left: 50, right: 50 },
      shading: opts.fill ? { type: ShadingType.CLEAR, color: "auto", fill: opts.fill } : undefined,
      children: [
        new Paragraph({
          alignment: opts.align === "right" ? AlignmentType.RIGHT : opts.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
          // jarak baris dikunci tepat 8 pt (160 twips) untuk huruf 7 pt supaya tinggi baris tabel
          // sama di Word, LibreOffice, dan PDF
          spacing: { line: 160, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
          run: { size: SZ, font: FONT }, // tanda paragraf ikut 7 pt supaya tinggi baris tidak membengkak
          children: [new TextRun({ text, size: SZ, font: FONT, bold: opts.bold })],
        }),
      ],
    });

  const barisJudul = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: kolom.map((k, i) => sel(k.label, i, { bold: true, fill: "D9E2F3", align: "center" })),
  });

  const barisData = d.baris.map(
    (b, n) =>
      new TableRow({
        cantSplit: true,
        children: kolom.map((k, i) => sel(nilaiSel(k, b, n), i, { align: k.align })),
      })
  );

  const jumlahRincian = s.lampiranRincian;
  const tot = totalKolom(d.baris);
  const jmlRow = jumlahRincian
    ? new TableRow({
        cantSplit: true,
        children: [
          sel("Jumlah", 0, { bold: true, align: "center", span: 5, widthTwip: lebar.slice(0, 5).reduce((a, b) => a + b, 0) }),
          ...kolom.slice(5).map((k, j) => sel(rp(tot[k.key as string]), 5 + j, { bold: true, align: "right" })),
        ],
      })
    : new TableRow({
        cantSplit: true,
        children: [sel(`Jumlah: ${d.baris.length} kendaraan`, 0, { bold: true, align: "center", span: kolom.length, widthTwip: lebarTotal })],
      });

  const tabel = new Table({
    width: { size: lebarTotal, type: WidthType.DXA },
    columnWidths: lebar,
    layout: TableLayoutType.FIXED,
    alignment: AlignmentType.CENTER,
    rows: [barisJudul, ...barisData, jmlRow],
  });

  const judul = (text: string, after = 0) =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 240, after },
      children: [new TextRun({ text, bold: true, size: 20, font: FONT })],
    });

  const lampiranChildren: (Paragraph | Table)[] = [
    judul("DAFTAR KENDARAAN JATUH TEMPO PAJAK KENDARAAN BERMOTOR"),
    judul(`a.n. ${d.instansi}`, 160),
    tabel,
  ];
  if (d.pemutihan) {
    lampiranChildren.push(
      new Paragraph({
        spacing: { before: 120, after: 0 },
        children: [new TextRun({ text: catatanPemutihan(d.pemutihan), italics: true, size: 16, font: FONT })],
      })
    );
  }

  const headerKosong = () => new Header({ children: [new Paragraph({ children: [] })] });
  const headerKop = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 240, lineRule: LineRuleType.AUTO, before: 0, after: 0 },
        // Gambar kop dibuat "mengambang" (tidak mengikuti tinggi header), supaya posisinya tetap
        // utuh di Word maupun aplikasi lain: 1,25 cm dari tepi atas, rata tengah halaman.
        children: [
          new ImageRun({
            type: "jpg",
            data: kop,
            transformation: { width: 601, height: 94 },
            floating: {
              horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
              verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: Math.round(1.25 * 360000) },
              wrap: { type: TextWrappingType.NONE },
              behindDocument: true,
              allowOverlap: true,
              lockAnchor: true,
            },
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: "UPTD PPRD Wilayah Samarinda",
    title: `${d.jenis} ${d.instansi}`,
    styles: { default: { document: { run: { font: FONT, size: 24 } } } },
    sections: [
      {
        properties: {
          titlePage: true, // kop hanya di halaman pertama
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { ...SURAT, header: cm(1.25), footer: cm(1.25) },
          },
        },
        headers: { first: headerKop, default: headerKosong() },
        children: halamanSurat,
      },
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { ...LAMPIRAN, header: cm(0.8), footer: cm(0.8) },
          },
        },
        headers: { default: headerKosong(), first: headerKosong() },
        children: lampiranChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
