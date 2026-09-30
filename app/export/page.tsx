import { Database, Receipt, FileCheck2, AlertTriangle, ClipboardEdit, Download } from "lucide-react";

const EXPORT_TYPES = [
  { key: "master", title: "Data master", icon: Database, action: "/api/export/master" },
  { key: "transaksi", title: "Data transaksi", icon: Receipt, action: "/api/export/transaksi" },
  { key: "hasil-spjt", title: "Hasil SPJT (status & tgl bayar)", icon: FileCheck2, action: "/api/export/hasil-spjt" },
  { key: "lewat-jatuh-tempo", title: "Kendaraan lewat jatuh tempo", icon: AlertTriangle, action: "/api/export/lewat-jatuh-tempo" },
  { key: "perubahan-status", title: "Perubahan status kendaraan", icon: ClipboardEdit, action: "/api/export/perubahan-status" },
];

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Export data</h1>
        <p className="text-sm text-muted">Unduh data dalam format Excel (.xlsx).</p>
      </div>

      <div className="panel divide-y divide-line">
        {EXPORT_TYPES.map((e) => {
          const Icon = e.icon;
          return (
            <form key={e.key} action={e.action} method="get" className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="icon-chip bg-primary-100 text-primary-700 w-9 h-9">
                  <Icon size={16} />
                </div>
                <span className="text-sm font-medium">{e.title}</span>
              </div>
              <button className="btn-secondary">
                <Download size={14} /> Export .xlsx
              </button>
            </form>
          );
        })}
      </div>
    </div>
  );
}
