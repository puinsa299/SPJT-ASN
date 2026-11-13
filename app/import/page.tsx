import ImportBesar from "@/components/ImportBesar";
import ImportHasilCek from "@/components/ImportHasilCek";
import { Database, Receipt, FileCheck2, ClipboardEdit, Tag, Upload, CheckCircle2, Calculator, Palette } from "lucide-react";

const IMPORT_TYPES = [
  {
    key: "warna-plat",
    title: "Warna plat (Merah/Hitam)",
    icon: Palette,
    desc: "Isi/koreksi massal warna plat per kendaraan — kolom minimal: Nomor Polisi, Warna Plat (tulis 'Merah' atau 'Hitam'). Dipakai untuk menentukan tarif PKB yang benar (Merah 0,5%, Hitam 0,8%). Aman diulang, nopol yang sama akan menimpa warna sebelumnya.",
    action: "/api/import/warna-plat",
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
    belum_balik_nama?: string;
    jumlah?: string;
    kategori?: string;
    takditemukan?: string;
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
              {Number(searchParams.belum_balik_nama) > 0 && (
                <> {searchParams.belum_balik_nama} kendaraan terdeteksi belum balik nama (nama di Samsat beda dari data kita) — cek di menu Data Kendaraan.</>
              )}
            </p>
          </div>
        </div>
      )}

      {searchParams.sukses === "njkb" && (
        <div className="panel p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">Import tabel NJKB berhasil.</p>
            <p className="text-emerald-700">
              {searchParams.jumlah} baris NJKB tersimpan dari {searchParams.kategori} kategori kendaraan.
              Pokok PKB kendaraan akan otomatis terhitung ulang (live) berdasarkan tabel ini.
            </p>
          </div>
        </div>
      )}

      {searchParams.sukses === "warna-plat" && (
        <div className="panel p-4 flex items-start gap-3 border-emerald-200 bg-emerald-50">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-800">
            <p className="font-medium">Import Warna Plat berhasil.</p>
            <p className="text-emerald-700">
              {searchParams.jumlah} kendaraan diupdate warna platnya.
              {Number(searchParams.takditemukan) > 0 && (
                <> {searchParams.takditemukan} nomor polisi di file tidak ditemukan di sistem, dilewati.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Tabel NJKB — form khusus, timpa seluruh isi setiap kali diupload */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
            <Calculator size={16} />
          </div>
          <h2 className="text-sm font-semibold">Tabel NJKB (Pergub)</h2>
        </div>
        <p className="text-xs text-muted mb-4">
          Lampiran NJKB resmi (satu sheet per jenis kendaraan: Sedan, Jeep, Minibus, Pickup, Truck,
          Roda 2, dst), bisa juga file format baru (satu sheet besar berisi semua kategori &amp;
          tahun). Boleh pilih lebih dari satu file sekaligus (misalnya file lama &amp; file baru
          bersamaan) — hasilnya akan digabung jadi satu tabel NJKB. Dipakai untuk menghitung otomatis
          Pokok PKB, Opsen, Denda PKB/Opsen, dan SWDKLLJ di dashboard &amp; SPJT. Aman diulang — tiap
          upload menimpa seluruh isi tabel NJKB dengan data terbaru dari file yang dipilih.
        </p>
        <ImportBesar jenis="njkb" />
      </div>

      {/* Transaksi bulanan — dibaca di browser, dikirim per potongan (aman untuk file besar) */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
            <Receipt size={16} />
          </div>
          <h2 className="text-sm font-semibold">Transaksi bulanan</h2>
        </div>
        <p className="text-xs text-muted mb-4">
          Sistem mencocokkan lewat No. Polisi lalu memperbarui tanggal bayar, jatuh tempo (akhir PKB terbaru),
          nominal PKB, dan data kendaraan (kode jenis, cc, kode plat, no rangka, tanggal awal STNK). Riwayat
          pembayaran tersimpan permanen. Boleh pilih beberapa file sekaligus. File dibaca di browser Anda dan
          dikirim bertahap, jadi aman untuk file besar. Aman diulang.
        </p>
        <ImportBesar jenis="transaksi" />
      </div>

      {/* Hasil cek SPJT/STPD — pratinjau dulu, perubahan baru disimpan setelah "Terapkan" */}
      <div className="panel p-5">
        <div className="flex items-center gap-2 mb-2">
          <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
            <FileCheck2 size={16} />
          </div>
          <h2 className="text-sm font-semibold">Import Hasil Cek SPJT/STPD (Realisasi &amp; Jatuh Tempo)</h2>
        </div>
        <ul className="text-xs text-muted mb-4 list-disc pl-4 space-y-1">
          <li>Pakai file HASIL_CEK (sheet HASIL). Kolom wajib: NOPOL dan Status.</li>
          <li>SUDAH DIBAYAR: realisasi dicatat (tanggal bayar = TG BAYAR, masa akhir = TG AKHIR PKB, tanpa nominal) dan jatuh tempo diubah ke TG AKHIR PKB.</li>
          <li>BAYAR SEBAGIAN: hanya jatuh tempo yang diubah, realisasi tidak dicatat.</li>
          <li>SESUAI, TANGGAL BERBEDA, DATA BERBEDA: jatuh tempo diubah hanya bila berbeda dari data aplikasi; realisasi tidak dicatat.</li>
          <li>TIDAK DITEMUKAN, GAGAL DIPROSES, TIDAK DICEK, GANTI NOPOL: dilewati dan masuk laporan.</li>
          <li>Nopol yang tidak ada di aplikasi tidak dibuat baru. Aman diimpor berulang, realisasi tidak dobel.</li>
          <li>Pratinjau tidak mengubah data. Unduh cadangan dulu (menu Export Data) sebelum menerapkan.</li>
        </ul>
        <ImportHasilCek />
      </div>

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
        <ImportBesar jenis="master" />
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
