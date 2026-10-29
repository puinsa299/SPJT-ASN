"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle2, FileText, Percent, Gift, Receipt, Plus, Trash2, Save, AlertCircle } from "lucide-react";

type Row = Record<string, any>;
type Tab = "SPJT" | "STPD" | "parameter" | "swdkllj" | "pemutihan";

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "SPJT", label: "Surat SPJT", icon: FileText },
  { id: "STPD", label: "Surat STPD", icon: FileText },
  { id: "parameter", label: "Parameter tagihan", icon: Percent },
  { id: "swdkllj", label: "Tarif SWDKLLJ", icon: Receipt },
  { id: "pemutihan", label: "Pemutihan", icon: Gift },
];

const FIELD_SURAT: [string, string, "text" | "area" | "number"][] = [
  ["kota", "Kota (tempat surat)", "text"],
  ["sifat", "Sifat surat", "text"],
  ["paragraf1", "Paragraf 1 (kosong = bawaan). Placeholder: {instansi}, {batas_hari}", "area"],
  ["paragraf2", "Paragraf 2 (kosong = bawaan)", "area"],
  ["paragraf3", "Paragraf 3 (opsional)", "area"],
  ["penutup", "Kalimat penutup", "text"],
  ["jabatan", "Jabatan penandatangan", "text"],
  ["nama_pejabat", "Nama pejabat (kosong = ${nama_pengirim})", "text"],
  ["nip", "NIP", "text"],
  ["batas_hari", "Batas waktu pelunasan (hari kalender)", "number"],
];

// [kolom, label, bantuan, tipe]
const FIELD_PARAM: [string, string, string, "number" | "date" | "select"][] = [
  ["tarif_pkb_merah", "Tarif PKB plat merah", "Desimal, 0,005 = 0,5%", "number"],
  ["tarif_pkb_hitam", "Tarif PKB plat hitam", "Desimal, 0,008 = 0,8%", "number"],
  ["persentase_opsen", "Opsen", "0,66 = 66% dari pokok PKB", "number"],
  ["tanggal_cutoff_denda", "Tanggal batas aturan denda baru", "Masa pajak mulai tanggal ini memakai denda baru", "date"],
  ["tarif_denda_pkb_baru", "Denda PKB per bulan (baru)", "0,01 = 1%", "number"],
  ["maks_bulan_denda_pkb_baru", "Maks. bulan denda PKB (baru)", "bulan", "number"],
  ["tarif_denda_pkb_lama", "Denda PKB per bulan (lama)", "0,02 = 2%", "number"],
  ["maks_bulan_denda_pkb_lama", "Maks. bulan denda PKB (lama)", "bulan", "number"],
  ["sanksi_keterlambatan_lama", "Sanksi administrasi (aturan lama)", "Rp, per masa pajak lama", "number"],
  ["tarif_denda_opsen", "Denda opsen per bulan", "0,01 = 1%", "number"],
  ["maks_bulan_denda_opsen", "Maks. bulan denda opsen", "bulan", "number"],
  ["maks_tahun_tunggakan", "Maks. tahun tunggakan PKB", "tahun", "number"],
  ["maks_tahun_swdkllj", "Maks. tahun tunggakan SWDKLLJ", "tahun", "number"],
  ["stnk_roda2", "Biaya STNK roda 2", "Rp (PP 76/2020)", "number"],
  ["stnk_roda4", "Biaya STNK roda 4", "Rp (PP 76/2020)", "number"],
  ["plat_roda2", "Biaya plat roda 2", "Rp (PP 76/2020)", "number"],
  ["plat_roda4", "Biaya plat roda 4", "Rp (PP 76/2020)", "number"],
  ["biaya_kartu_dana", "Biaya kartu dana", "Rp (PMK 16/2017 Pasal 6)", "number"],
  ["kartu_dana_per", "Kartu dana dikenakan", "per kendaraan atau per tahun tagihan", "select"],
  ["swdkllj_denda_hari_per_tahap", "Denda SWDKLLJ: hari per tahap", "hari", "number"],
  ["swdkllj_denda_tahap1", "Denda SWDKLLJ tahap 1", "0,25 = 25%", "number"],
  ["swdkllj_denda_tahap2", "Denda SWDKLLJ tahap 2", "0,50 = 50%", "number"],
  ["swdkllj_denda_tahap3", "Denda SWDKLLJ tahap 3", "0,75 = 75%", "number"],
  ["swdkllj_denda_tahap4", "Denda SWDKLLJ tahap 4", "1,00 = 100%", "number"],
  ["swdkllj_denda_maks_per_tahun", "Denda SWDKLLJ maks. per tahun", "Rp", "number"],
];

export default function PengaturanPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("SPJT");
  const [pesan, setPesan] = useState<{ ok: boolean; teks: string } | null>(null);
  const [surat, setSurat] = useState<Record<string, Row>>({});
  const [param, setParam] = useState<Row | null>(null);
  const [tarif, setTarif] = useState<Row[]>([]);
  const [program, setProgram] = useState<Row[]>([]);
  const [tier, setTier] = useState<Row[]>([]);

  const info = (ok: boolean, teks: string) => {
    setPesan({ ok, teks });
    setTimeout(() => setPesan(null), 4000);
  };

  const muat = useCallback(async () => {
    const [s, p, t, pr, ti] = await Promise.all([
      supabase.from("pengaturan_surat").select("*"),
      supabase.from("parameter_pkb").select("*").limit(1).maybeSingle(),
      supabase.from("tarif_swdkllj").select("*").order("urut"),
      supabase.from("program_pemutihan").select("*").order("tanggal_mulai", { ascending: false }),
      supabase.from("pemutihan_diskon_tier").select("*").order("min_tahun_tunggakan"),
    ]);
    setSurat(Object.fromEntries((s.data ?? []).map((r: Row) => [r.jenis, r])));
    setParam(p.data ?? null);
    setTarif(t.data ?? []);
    setProgram(pr.data ?? []);
    setTier(ti.data ?? []);
  }, [supabase]);

  useEffect(() => {
    muat();
  }, [muat]);

  const hariIni = new Date().toISOString().slice(0, 10);

  // ---------- simpan ----------
  async function simpanSurat(jenis: string) {
    const r = { ...(surat[jenis] ?? { jenis }) };
    r.batas_hari = r.batas_hari === "" || r.batas_hari == null ? null : Number(r.batas_hari);
    for (const [k] of FIELD_SURAT) if (r[k] === "") r[k] = null;
    r.updated_at = new Date().toISOString();
    const { error } = await supabase.from("pengaturan_surat").upsert(r);
    info(!error, error ? error.message : `Pengaturan surat ${jenis} tersimpan.`);
  }
  async function simpanParam() {
    if (!param) return;
    const { id, updated_at, ...isi } = param;
    for (const k of Object.keys(isi)) if (isi[k] === "") isi[k] = null;
    const { error } = await supabase.from("parameter_pkb").update(isi).eq("id", id);
    info(!error, error ? error.message : "Parameter tagihan tersimpan. Perhitungan langsung memakai nilai baru.");
  }
  async function simpanTarif() {
    const { error } = await supabase.from("tarif_swdkllj").upsert(tarif.map((t) => ({ ...t, nominal: Number(t.nominal) })));
    info(!error, error ? error.message : "Tarif SWDKLLJ tersimpan.");
  }
  async function simpanProgram(p: Row) {
    const { diskon_swdkllj_persen, baru, created_at, updated_at, ...lain } = p;
    const payload = { ...lain, diskon_swdkllj_persen: Number(diskon_swdkllj_persen ?? 0) };
    const { error } = await supabase.from("program_pemutihan").upsert(payload);
    if (error) return info(false, error.message);
    const tiers = tier.filter((t) => t.program_id === p.id);
    await supabase.from("pemutihan_diskon_tier").delete().eq("program_id", p.id);
    if (tiers.length) {
      const { error: e2 } = await supabase.from("pemutihan_diskon_tier").insert(
        tiers.map((t) => ({ program_id: p.id, min_tahun_tunggakan: Number(t.min_tahun_tunggakan), diskon_persen: Number(t.diskon_persen) }))
      );
      if (e2) return info(false, e2.message);
    }
    info(true, `Program "${p.nama}" tersimpan.`);
    muat();
  }
  async function hapusProgram(id: string) {
    if (!confirm("Hapus program pemutihan ini?")) return;
    const { error } = await supabase.from("program_pemutihan").delete().eq("id", id);
    info(!error, error ? error.message : "Program dihapus.");
    muat();
  }
  function programBaru() {
    const id = crypto.randomUUID();
    setProgram([
      { id, nama: "Program pemutihan baru", tanggal_mulai: hariIni, tanggal_selesai: hariIni, aktif: false, hapus_denda_pkb: true, hapus_denda_opsen: true, hapus_denda_swdkllj: true, hapus_sanksi_adm: true, diskon_swdkllj_persen: 0, baru: true },
      ...program,
    ]);
  }

  const setP = (id: string, k: string, v: any) => setProgram((l) => l.map((p) => (p.id === id ? { ...p, [k]: v } : p)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Pengaturan</h1>
        <p className="text-sm text-muted">Isi surat, parameter tagihan, tarif SWDKLLJ, dan program pemutihan. Perubahan langsung berlaku tanpa mengubah kode.</p>
      </div>

      {pesan && (
        <div className={`panel p-3 flex items-center gap-3 ${pesan.ok ? "border-emerald-300 bg-emerald-50" : "border-rose-300 bg-rose-50"}`}>
          {pesan.ok ? <CheckCircle2 size={18} className="text-emerald-600" /> : <AlertCircle size={18} className="text-rose-600" />}
          <p className={`text-sm font-medium ${pesan.ok ? "text-emerald-800" : "text-rose-800"}`}>{pesan.teks}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`tab inline-flex items-center gap-2 ${tab === t.id ? "tab-aktif" : ""}`}>
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------------- Surat ---------------- */}
      {(tab === "SPJT" || tab === "STPD") && (
        <div className="panel">
          <div className="panel-head">
            <FileText size={16} className="text-primary-600" /> Pengaturan surat {tab}
          </div>
          <div className="p-5 grid gap-4 max-w-3xl">
            {FIELD_SURAT.map(([k, label, tipe]) => (
              <label key={k} className="block">
                <span className="text-sm text-muted block mb-1.5">{label}</span>
                {tipe === "area" ? (
                  <textarea
                    rows={5}
                    className="input"
                    value={surat[tab]?.[k] ?? ""}
                    onChange={(e) => setSurat((s) => ({ ...s, [tab]: { ...(s[tab] ?? { jenis: tab }), [k]: e.target.value } }))}
                  />
                ) : (
                  <input
                    type={tipe}
                    className="input"
                    value={surat[tab]?.[k] ?? ""}
                    onChange={(e) => setSurat((s) => ({ ...s, [tab]: { ...(s[tab] ?? { jenis: tab }), [k]: e.target.value } }))}
                  />
                )}
              </label>
            ))}
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={surat[tab]?.lampiran_rincian ?? true}
                onChange={(e) => setSurat((s) => ({ ...s, [tab]: { ...(s[tab] ?? { jenis: tab }), lampiran_rincian: e.target.checked } }))}
              />
              Lampiran memuat rincian tagihan pajak (dimatikan: hanya No, Nopol, Nama, No Rangka, Jatuh Tempo)
            </label>
            <p className="text-xs text-muted">Kolom yang dikosongkan memakai teks bawaan. Nomor naskah, hal, dan tanda tangan SRIKANDI tetap tercetak sebagai kode.</p>
            <div>
              <button className="btn-primary" onClick={() => simpanSurat(tab)}>
                <Save size={15} /> Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Parameter ---------------- */}
      {tab === "parameter" && param && (
        <div className="panel">
          <div className="panel-head">
            <Percent size={16} className="text-primary-600" /> Parameter tagihan
          </div>
          <div className="p-5 grid md:grid-cols-2 gap-4">
            {FIELD_PARAM.map(([k, label, bantuan, tipe]) => (
              <label key={k} className="block">
                <span className="text-sm font-medium block">{label}</span>
                <span className="text-xs text-muted block mb-1">{bantuan}</span>
                {tipe === "select" ? (
                  <select className="input" value={param[k] ?? "kendaraan"} onChange={(e) => setParam({ ...param, [k]: e.target.value })}>
                    <option value="kendaraan">per kendaraan (sekali)</option>
                    <option value="tahun">per tahun tagihan</option>
                  </select>
                ) : (
                  <input
                    type={tipe}
                    step="any"
                    className="input"
                    value={param[k] ?? ""}
                    onChange={(e) => setParam({ ...param, [k]: e.target.value })}
                  />
                )}
              </label>
            ))}
          </div>
          <div className="px-5 pb-5">
            <button className="btn-primary" onClick={simpanParam}>
              <Save size={15} /> Simpan parameter
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Tarif SWDKLLJ ---------------- */}
      {tab === "swdkllj" && (
        <div className="panel">
          <div className="panel-head">
            <Receipt size={16} className="text-primary-600" /> Tarif SWDKLLJ per golongan (PMK 16/PMK.010/2017 Pasal 5)
          </div>
          <table className="table-clean w-full">
            <thead>
              <tr>
                <th>Golongan</th>
                <th>Keterangan</th>
                <th className="w-44">Nominal (Rp)</th>
              </tr>
            </thead>
            <tbody>
              {tarif.map((t, i) => (
                <tr key={t.kode}>
                  <td className="font-mono text-xs">{t.kode}</td>
                  <td>{t.label}</td>
                  <td>
                    <input
                      type="number"
                      className="input"
                      value={t.nominal}
                      onChange={(e) => setTarif((l) => l.map((x, j) => (j === i ? { ...x, nominal: e.target.value } : x)))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="p-5">
            <button className="btn-primary" onClick={simpanTarif}>
              <Save size={15} /> Simpan tarif
            </button>
          </div>
        </div>
      )}

      {/* ---------------- Pemutihan ---------------- */}
      {tab === "pemutihan" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">Program yang aktif dan berlaku hari ini otomatis dipakai di seluruh perhitungan dan lampiran surat.</p>
            <button className="btn-primary" onClick={programBaru}>
              <Plus size={15} /> Program baru
            </button>
          </div>
          {program.length === 0 && <div className="panel p-6 text-sm text-muted">Belum ada program pemutihan.</div>}
          {program.map((p) => {
            const berlaku = p.aktif && hariIni >= p.tanggal_mulai && hariIni <= p.tanggal_selesai;
            const tiers = tier.filter((t) => t.program_id === p.id);
            return (
              <div key={p.id} className={`panel border-l-4 ${berlaku ? "border-l-emerald-500" : "border-l-slate-300"}`}>
                <div className="panel-head justify-between">
                  <span className="flex items-center gap-2">
                    <Gift size={16} className="text-pink-500" /> {p.nama}
                  </span>
                  <span className={`badge-status ${berlaku ? "badge-sudah-bayar" : "badge-luar-daerah"}`}>{berlaku ? "Berlaku hari ini" : p.aktif ? "Di luar periode" : "Nonaktif"}</span>
                </div>
                <div className="p-5 grid md:grid-cols-3 gap-4">
                  <label className="block md:col-span-3">
                    <span className="text-sm text-muted block mb-1">Nama program</span>
                    <input className="input" value={p.nama} onChange={(e) => setP(p.id, "nama", e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-muted block mb-1">Mulai</span>
                    <input type="date" className="input" value={p.tanggal_mulai} onChange={(e) => setP(p.id, "tanggal_mulai", e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="text-sm text-muted block mb-1">Selesai</span>
                    <input type="date" className="input" value={p.tanggal_selesai} onChange={(e) => setP(p.id, "tanggal_selesai", e.target.value)} />
                  </label>
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={p.aktif} onChange={(e) => setP(p.id, "aktif", e.target.checked)} />
                    Program aktif
                  </label>

                  <div className="md:col-span-3">
                    <p className="text-sm font-medium mb-2">Yang dihapus</p>
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {[
                        ["hapus_denda_pkb", "Denda PKB"],
                        ["hapus_denda_opsen", "Denda opsen"],
                        ["hapus_denda_swdkllj", "Denda SWDKLLJ"],
                        ["hapus_sanksi_adm", "Sanksi administrasi"],
                      ].map(([k, l]) => (
                        <label key={k} className="flex items-center gap-2">
                          <input type="checkbox" className="w-4 h-4 accent-indigo-600" checked={!!p[k]} onChange={(e) => setP(p.id, k, e.target.checked)} />
                          {l}
                        </label>
                      ))}
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-sm text-muted block mb-1">Diskon pokok SWDKLLJ (%) — 0 = tanpa diskon</span>
                    <input type="number" step="any" className="input" value={p.diskon_swdkllj_persen ?? 0} onChange={(e) => setP(p.id, "diskon_swdkllj_persen", e.target.value)} />
                  </label>

                  <div className="md:col-span-3">
                    <p className="text-sm font-medium">Diskon pokok PKB berdasarkan lama tunggakan</p>
                    <p className="text-xs text-muted mb-2">Berlaku tingkat tertinggi yang terpenuhi. Contoh: ≥ 2 tahun diskon 50%.</p>
                    <div className="space-y-2">
                      {tiers.map((t) => (
                        <div key={t.id ?? t._k} className="flex items-center gap-2 text-sm">
                          <span>Tunggakan ≥</span>
                          <input type="number" min={1} className="input w-24" value={t.min_tahun_tunggakan} onChange={(e) => setTier((l) => l.map((x) => (x === t ? { ...x, min_tahun_tunggakan: e.target.value } : x)))} />
                          <span>tahun, diskon</span>
                          <input type="number" step="any" className="input w-24" value={t.diskon_persen} onChange={(e) => setTier((l) => l.map((x) => (x === t ? { ...x, diskon_persen: e.target.value } : x)))} />
                          <span>%</span>
                          <button className="text-rose-500 hover:text-rose-700 p-1" onClick={() => setTier((l) => l.filter((x) => x !== t))} title="Hapus tingkat">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button className="btn-secondary mt-2" onClick={() => setTier((l) => [...l, { _k: crypto.randomUUID(), program_id: p.id, min_tahun_tunggakan: 1, diskon_persen: 0 }])}>
                      <Plus size={14} /> Tambah tingkat
                    </button>
                  </div>
                </div>
                <div className="px-5 pb-5 flex gap-2">
                  <button className="btn-primary" onClick={() => simpanProgram(p)}>
                    <Save size={15} /> Simpan program
                  </button>
                  <button className="btn-secondary !text-rose-700 !bg-rose-50 !border-rose-200" onClick={() => (p.baru ? setProgram((l) => l.filter((x) => x.id !== p.id)) : hapusProgram(p.id))}>
                    <Trash2 size={14} /> Hapus
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
