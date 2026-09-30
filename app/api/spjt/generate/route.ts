import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readFileSync } from "fs";
import { join } from "path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  TabStopType,
  TableAnchorType,
  Header,
  ImageRun,
} from "docx";

function formatRupiah(n: number | null | undefined) {
  return (n ?? 0).toLocaleString("id-ID");
}

function formatTanggal(d: string | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" });
}

export async function POST(req: NextRequest) {
  const opdId = req.nextUrl.searchParams.get("opd_id");
  if (!opdId) {
    return NextResponse.json({ error: "opd_id wajib diisi" }, { status: 400 });
  }

  const supabase = createClient();

  const [{ data: opd }, { data: pengaturan }, { data: kendaraanPeriode }] = await Promise.all([
    supabase.from("opd").select("*").eq("id", opdId).single(),
    supabase.from("pengaturan_template").select("*").limit(1).single(),
    supabase
      .from("v_kendaraan_status")
      .select("kendaraan_id, jatuh_tempo")
      .eq("opd_id", opdId)
      .eq("masuk_periode_spjt", true),
  ]);

  if (!opd) {
    return NextResponse.json({ error: "OPD tidak ditemukan" }, { status: 404 });
  }
  if (!kendaraanPeriode || kendaraanPeriode.length === 0) {
    return NextResponse.json({ error: "Tidak ada kendaraan yang masuk periode SPJT untuk OPD ini" }, { status: 400 });
  }

  const kendaraanIds = kendaraanPeriode.map((k) => k.kendaraan_id);

  const [{ data: kendaraanDetail }, { data: pembayaranTerakhir }] = await Promise.all([
    supabase.from("kendaraan").select("*").in("id", kendaraanIds),
    supabase.from("v_kendaraan_pembayaran_terakhir").select("*").in("kendaraan_id", kendaraanIds),
  ]);

  const nilaiMap = new Map((pembayaranTerakhir ?? []).map((p) => [p.kendaraan_id, p]));

  const baris = (kendaraanDetail ?? []).map((k) => {
    const nilai = nilaiMap.get(k.id);
    return {
      kendaraan_id: k.id,
      nomor_polisi_display: k.nomor_polisi_display,
      merk_model: `${k.merk ?? ""} ${k.model ?? ""}`.trim(),
      tahun: k.tahun,
      jatuh_tempo: k.jatuh_tempo,
      pokok: nilai?.pokok_pkb ?? null,
      opsen: nilai?.opsen ?? null,
      swdkllj: nilai?.swdkllj ?? null,
      total: nilai?.total ?? null,
    };
  });

  const totalPokok = baris.reduce((a, b) => a + (b.pokok ?? 0), 0);
  const totalOpsen = baris.reduce((a, b) => a + (b.opsen ?? 0), 0);
  const totalSwdkllj = baris.reduce((a, b) => a + (b.swdkllj ?? 0), 0);
  const totalTotal = baris.reduce((a, b) => a + (b.total ?? 0), 0);

  // ---- Isi surat, ganti placeholder ${nama_opd} ----
  const isiSuratMentah =
    pengaturan?.isi_surat ??
    "Berdasarkan basis data kendaraan bermotor yang telah kami inventarisasi, terdapat kendaraan bermotor Aparatur Sipil Negara (ASN) yang bekerja pada Instansi Saudara sebagaimana tercantum dalam lampiran surat ini yang akan segera memasuki masa jatuh tempo pembayaran Pajak Kendaraan Bermotor (PKB). Sehubungan dengan hal tersebut, kami mengimbau agar pembayaran PKB dapat dilakukan tepat waktu guna menghindari sanksi administratif sesuai ketentuan yang berlaku. Pembayaran PKB dapat dilakukan melalui Kantor Samsat Induk Samarinda sesuai dengan jadwal pelayanan yang berlaku.\n\nAdapun informasi mengenai besaran pajak yang harus dibayarkan dapat diakses melalui laman http://simpator.kaltimprov.go.id atau melakukan konfirmasi kepada Bagian Penetapan pada Kantor Samsat terdekat.\n\nApabila terdapat kendaraan sebagaimana tercantum dalam lampiran yang telah dialihkan kepemilikannya, kami mohon kesediaan Saudara untuk menyampaikan tanggapan melalui surat balasan disertai informasi pendukung yang diperlukan. Konfirmasi dapat disampaikan kepada Bagian Penetapan UPTD PPRD Wilayah Samarinda melalui nomor whatsapp: 0815-2842-4696 (Maulida), sehingga data kendaraan dapat dilakukan verifikasi dan pemutakhiran.\n\nDemikian surat ini kami sampaikan, atas perhatian dan kerjasamanya diucapkan terima kasih.";

  const paragrafIsi = isiSuratMentah
    .replaceAll("${nama_opd}", opd.nama_opd)
    .split("\n\n")
    .filter((p: string) => p.trim().length > 0);

  const cellHeader = (text: string, width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" },
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 18, font: "Arial" })] })],
    });

  const cellText = (
    text: string,
    width: number,
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
  ) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      children: [new Paragraph({ alignment, children: [new TextRun({ text, size: 18, font: "Arial" })] })],
    });

  const colWidths = [704, 1200, 1826, 1045, 1248, 1153, 1153, 1237, 1201]; // twips, diukur presisi dari dokumen referensi RSUD

  const tableHeaderRow = new TableRow({
    children: [
      cellHeader("No", colWidths[0]),
      cellHeader("No. Polisi", colWidths[1]),
      cellHeader("Merk / Model", colWidths[2]),
      cellHeader("Tahun", colWidths[3]),
      cellHeader("Jatuh Tempo", colWidths[4]),
      cellHeader("Pokok", colWidths[5]),
      cellHeader("Opsen", colWidths[6]),
      cellHeader("SWDKLLJ", colWidths[7]),
      cellHeader("Total", colWidths[8]),
    ],
  });

  const tableDataRows = baris.map(
    (b, i) =>
      new TableRow({
        children: [
          cellText(String(i + 1), colWidths[0], AlignmentType.CENTER),
          cellText(b.nomor_polisi_display, colWidths[1]),
          cellText(b.merk_model, colWidths[2]),
          cellText(String(b.tahun ?? "-"), colWidths[3], AlignmentType.CENTER),
          cellText(formatTanggal(b.jatuh_tempo), colWidths[4], AlignmentType.CENTER),
          cellText(b.pokok !== null ? formatRupiah(b.pokok) : "belum ada data", colWidths[5], AlignmentType.RIGHT),
          cellText(b.opsen !== null ? formatRupiah(b.opsen) : "-", colWidths[6], AlignmentType.RIGHT),
          cellText(b.swdkllj !== null ? formatRupiah(b.swdkllj) : "-", colWidths[7], AlignmentType.RIGHT),
          cellText(b.total !== null ? formatRupiah(b.total) : "-", colWidths[8], AlignmentType.RIGHT),
        ],
      })
  );

  // Baris total: 5 kolom pertama digabung jadi satu cell (columnSpan), sisanya 4 angka total
  const tableTotalRow = new TableRow({
    children: [
      new TableCell({
        width: { size: colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4], type: WidthType.DXA },
        columnSpan: 5,
        shading: { type: ShadingType.CLEAR, color: "auto", fill: "F2F2F2" },
        children: [new Paragraph({ children: [] })],
      }),
      cellHeader(formatRupiah(totalPokok), colWidths[5]),
      cellHeader(formatRupiah(totalOpsen), colWidths[6]),
      cellHeader(formatRupiah(totalSwdkllj), colWidths[7]),
      cellHeader(formatRupiah(totalTotal), colWidths[8]),
    ],
  });

  const tableBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "auto" },
  };

  const lampiranTable = new Table({
    width: { size: colWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: colWidths,
    borders: tableBorders,
    // Margin sel super tipis + posisi "mengambang" nempel ke tepi halaman —
    // ini kunci supaya tabel 9 kolom muat rapi tanpa terpotong, persis seperti
    // dokumen referensi (diukur langsung dari XML aslinya).
    margins: { top: 20, bottom: 20, left: 10, right: 10 },
    float: {
      horizontalAnchor: TableAnchorType.PAGE,
      absoluteHorizontalPosition: 705,
      verticalAnchor: TableAnchorType.TEXT,
      absoluteVerticalPosition: 0,
      leftFromText: 180,
      rightFromText: 180,
    },
    rows: [tableHeaderRow, ...tableDataRows, tableTotalRow],
  });

  // Baris kop surat (Nomor/Sifat/Lampiran/Hal): pakai tab stop supaya titik dua sejajar rapi,
  // posisi diukur persis dari dokumen referensi (1080 & 1260 twips).
  const headerTabStops = [
    { type: TabStopType.LEFT, position: 1080 },
    { type: TabStopType.LEFT, position: 1260 },
  ];
  const headerLine = (label: string, value: string) =>
    new Paragraph({
      tabStops: headerTabStops,
      spacing: { after: 200 },
      children: [new TextRun({ text: `${label}\t:\t${value}`, size: 22, font: "Arial" })],
    });

  // Blok tanda tangan (Kepala, ttd, nama, NIP) — indent kiri persis dokumen referensi (5812 twips)
  const SIGNATURE_INDENT = 5812;

  // ---- Kop surat: gambar tetap (logo + nama instansi jadi 1 file), muncul HANYA di halaman 1 ----
  const kopSuratBuffer = readFileSync(join(process.cwd(), "assets", "kop-surat.jpeg"));
  const kopSuratHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new ImageRun({
            data: kopSuratBuffer,
            transformation: { width: 602, height: 94 },
            type: "jpg",
          }),
        ],
      }),
    ],
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Arial", size: 22 } },
      },
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 } }, // A4
          titlePage: true, // header "first" cuma muncul di halaman 1, halaman lampiran polos
        },
        headers: { first: kopSuratHeader },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 200 },
            children: [new TextRun({ text: "Samarinda, ${tanggal_naskah}", size: 22, font: "Arial" })],
          }),
          headerLine("Nomor", "${nomor_naskah}"),
          headerLine("Sifat", "${sifat}"),
          headerLine("Lampiran", pengaturan?.lampiran_teks ?? "1 (satu) lembar"),
          headerLine("Hal", "${hal}"),
          new Paragraph({ spacing: { before: 200, after: 0 }, children: [new TextRun({ text: `Yth. Pimpinan ${opd.nama_opd}`, size: 22, font: "Arial" })] }),
          new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: "di –", size: 22, font: "Arial" })] }),
          new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 720 }],
            spacing: { after: 200 },
            children: [new TextRun({ text: "\tTempat", size: 22, font: "Arial" })],
          }),
          new Paragraph({ text: "" }),
          ...paragrafIsi.map((text) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 200 }, indent: { firstLine: 709 }, children: [new TextRun({ text, size: 22, font: "Arial" })] })),
          new Paragraph({ text: "" }),
          new Paragraph({ indent: { left: SIGNATURE_INDENT }, children: [new TextRun({ text: pengaturan?.jabatan_pengirim ?? "Kepala,", size: 22, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          new Paragraph({ indent: { left: SIGNATURE_INDENT }, children: [new TextRun({ text: pengaturan?.nama_pengirim ?? "${nama_pengirim}", size: 22, font: "Arial", bold: true })] }),
          new Paragraph({ indent: { left: SIGNATURE_INDENT }, children: [new TextRun({ text: `NIP ${pengaturan?.nip_pengirim ?? "-"}`, size: 22, font: "Arial" })] }),

          new Paragraph({ children: [], pageBreakBefore: true }),

          new Paragraph({
            alignment: AlignmentType.CENTER,
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "DAFTAR KENDARAAN JATUH TEMPO PAJAK KENDARAAN BERMOTOR", bold: true, font: "Arial" })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 300 },
            children: [new TextRun({ text: `a.n. ASN ${opd.nama_opd}`, bold: true, size: 22, font: "Arial" })],
          }),
          lampiranTable,
          new Paragraph({ text: "", spacing: { before: 400 } }),
          new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Mengetahui,", size: 22, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          new Table({
            width: { size: 9000, type: WidthType.DXA },
            columnWidths: [4500, 4500],
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 4500, type: WidthType.DXA },
                    borders: noBorders(),
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Kepala UPTD PPRD Samarinda", size: 22, font: "Arial" })] }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pengaturan?.nama_kepala_uptd ?? "-", bold: true, size: 22, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `NIP. ${pengaturan?.nip_kepala_uptd ?? "-"}`, size: 22, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 4500, type: WidthType.DXA },
                    borders: noBorders(),
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Penanggungjawab Jasa Raharja Samsat Samarinda", size: 22, font: "Arial" })] }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ text: "" }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pengaturan?.nama_pj_jasaraharja ?? "-", bold: true, size: 22, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `NPP. ${pengaturan?.npp_pj_jasaraharja ?? "-"}`, size: 22, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  function noBorders() {
    const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    return { top: none, bottom: none, left: none, right: none };
  }

  const buffer = await Packer.toBuffer(doc);

  // ---- Simpan riwayat_spjt + snapshot pivot, dan catat activity_log ----
  const { data: riwayat } = await supabase
    .from("riwayat_spjt")
    .insert({ opd_id: opdId, status: "Sudah Dibuat" })
    .select()
    .single();

  if (riwayat) {
    await supabase.from("spjt_kendaraan").insert(
      baris.map((b) => ({
        riwayat_spjt_id: riwayat.id,
        kendaraan_id: b.kendaraan_id,
        pokok_pkb_snapshot: b.pokok,
        opsen_snapshot: b.opsen,
        swdkllj_snapshot: b.swdkllj,
        total_snapshot: b.total,
      }))
    );

    await supabase.from("activity_log").insert({
      jenis_aksi: "generate_spjt",
      deskripsi: `Generate SPJT untuk ${opd.nama_opd} (${baris.length} kendaraan)`,
      referensi_id: riwayat.id,
      referensi_tabel: "riwayat_spjt",
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="SPJT_${opd.nama_opd.replace(/\s+/g, "_")}.docx"`,
    },
  });
}
