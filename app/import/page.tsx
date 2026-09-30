import { Database, Receipt, ClipboardEdit, Tag, Upload, CheckCircle2 } from "lucide-react";

const IMPORT_TYPES = [
  {
    key: "transaksi",
    title: "Transaksi bulanan",
    icon: Receipt,
    desc: "Sistem mencocokkan lewat No. Polisi lalu memperbarui status Sudah Bayar/Belum Bayar, tanggal bayar, masa pajak, dan nominal PKB. Riwayat pembayaran tersimpan permanen. Boleh pilih beberapa file sekaligus.",
    action: "/api/import/transaksi",
    multiple: true,
  },
  {
    key: "status",
    title: "Perubahan status kendaraan",
    icon: ClipboardEdit,
    desc: "Hasil pendataan lapangan (Dijual, Mutasi, Ganti Nopol, Non-aktif, atau kembali Aktif). Kolom minimal: No Polisi, Status (opsional Keterangan).",
    action: "/api/import/status",
  },
  {
    key: "lapor-jual",
    title: "Lapor jual",
    icon: Tag,
    desc: "Membaca kolom NOPOL dan KETERANGAN, mendukung format lama & bulanan serta variasi/typo. Boleh pilih beberapa file sekaligus, aman diulang.",
    action: "/api/import/lapor-jual",
    multiple: true,
  },
];

export default function ImportPage({
  searchParams,
}: {
  searchParams: {
    sukses?: string;
    ditambah?: string;
    diupdate?: string;
    bayar_baru?: string;
    nonaktif?: string;
    opd_baru?: string;
    dicocokkan?: string;
    diabaikan?: string;
  };
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Import data</h1>
        <p className="text-sm text-muted">
          Unggah file Excel/CSV sesuai kategori. Setiap import akan tercatat di Histori Data.
        </p>
      </div>

      {searchParams.sukses === "master" && (
        <div className="panel p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">Import Database Master berhasil.</p>
            <p className="text-emerald-700">
              {searchParams.ditambah} kendaraan ditambah, {searchParams.diupdate} identitas diperbarui,{" "}
              {searchParams.bayar_baru} pembayaran baru tercatat (opsen 66% dihitung otomatis),{" "}
              {searchParams.nonaktif} ditandai non-aktif (hilang dari data terbaru).
              {Number(searchParams.opd_baru) > 0 && (
                <> {searchParams.opd_baru} OPD baru otomatis dibuat — cek &amp; verifikasi di menu Data OPD.</>
              )}
            </p>
          </div>
        </div>
      )}

      {searchParams.sukses === "transaksi" && (
        <div className="panel p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">Import Transaksi Bulanan berhasil.</p>
            <p className="text-emerald-700">
              {searchParams.dicocokkan} nopol cocok dengan database, {searchParams.bayar_baru} pembayaran
              baru tercatat. {searchParams.diabaikan} nopol diabaikan (tidak ditemukan di database — bukan
              kendaraan ASN terdata).
            </p>
          </div>
        </div>
      )}

      {/* Database Master — form khusus, ada pilihan kategori */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
            <Database size={16} />
          </div>
          <h2 className="text-sm font-semibold">Database master</h2>
        </div>
        <p className="text-xs text-muted mb-4">
          Nopol yang sudah ada diperbarui, nopol baru ditambahkan, nopol yang hilang dari data
          terbaru dicatat Non-aktif (tetap tersimpan sebagai histori). Data transaksi tidak ikut
          tertimpa. Format kolom mengikuti sheet clean_datamaster_smd / Master Fixed.
        </p>
        <form action="/api/import/master" method="post" encType="multipart/form-data" className="space-y-3">
          <div>
            <label className="text-xs text-muted block mb-1">Kategori OPD pada file ini</label>
            <select
              name="kategori"
              required
              className="text-sm border border-line rounded-lg px-3 py-2 w-full bg-white"
            >
              <option value="">Pilih kategori...</option>
              <option value="Pemerintah Kota Samarinda">Pemerintah Kota Samarinda</option>
              <option value="Pemerintah Provinsi Kalimantan Timur">Pemerintah Provinsi Kalimantan Timur</option>
            </select>
          </div>
          <input type="file" name="file" accept=".xlsx,.xls" className="text-sm w-full" required />
          <button className="btn-primary">
            <Upload size={14} /> Import
          </button>
        </form>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {IMPORT_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.key} className="panel p-5">
              <div className="flex items-center gap-2 mb-2">
                <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
                  <Icon size={16} />
                </div>
                <h2 className="text-sm font-semibold">{t.title}</h2>
              </div>
              <p className="text-xs text-muted mb-4">{t.desc}</p>
              <form action={t.action} method="post" encType="multipart/form-data" className="space-y-3">
                <input
                  type="file"
                  name="file"
                  multiple={t.multiple}
                  accept=".xlsx,.xls,.csv"
                  className="text-sm w-full"
                />
                <button className="btn-primary">
                  <Upload size={14} /> Import
                </button>
              </form>
            </div>
          );
        })}
      </div>
    </div>
  );
}
