import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/StatCard";
import Link from "next/link";
import {
  Building2,
  CarFront,
  AlertTriangle,
  Database,
  CircleCheck,
  Wallet,
  MailCheck,
  Search,
  ArrowRight,
  MapPinOff,
  UserX,
  Coins,
} from "lucide-react";

function formatRupiahSingkat(n: number) {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export const revalidate = 0;

export default async function DashboardPage() {
  const supabase = createClient();

  const [{ data: { user } }, { data: cards }, { data: statistikOpd }, { data: opdPerluSpjt }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("v_dashboard_cards").select("*").single(),
    supabase.from("v_statistik_pembayaran_opd").select("*"),
    supabase.from("v_opd_perlu_spjt").select("*").order("jumlah_kendaraan_perlu_spjt", { ascending: false }),
  ]);

  const isAdmin = !!user;
  const opdHref = (id: string) => (isAdmin ? `/opd/${id}` : `/login?redirect=/opd/${id}`);

  const totalKt = statistikOpd?.reduce((acc, o) => acc + (o.total_kendaraan_kt ?? 0), 0) ?? 0;
  const totalSudahBayar = statistikOpd?.reduce((acc, o) => acc + (o.sudah_bayar ?? 0), 0) ?? 0;
  const totalMasihAktif = statistikOpd?.reduce((acc, o) => acc + (o.masih_aktif ?? 0), 0) ?? 0;
  const totalBelumBayar = statistikOpd?.reduce((acc, o) => acc + (o.belum_bayar ?? 0), 0) ?? 0;
  const persentaseKepatuhan = totalKt > 0 ? ((totalSudahBayar / totalKt) * 100).toFixed(1) : "0";

  const opdLuarDaerah = (statistikOpd ?? [])
    .filter((o) => (o.total_luar_daerah ?? 0) > 0)
    .sort((a, b) => (b.total_luar_daerah ?? 0) - (a.total_luar_daerah ?? 0));

  const opdBelumBalikNama = (statistikOpd ?? [])
    .filter((o) => (o.total_belum_balik_nama ?? 0) > 0)
    .sort((a, b) => (b.total_belum_balik_nama ?? 0) - (a.total_belum_balik_nama ?? 0));
  const totalBelumBalikNama = opdBelumBalikNama.reduce((acc, o) => acc + (o.total_belum_balik_nama ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted">Ringkasan kepatuhan pembayaran PKB kendaraan ASN</p>
      </div>

      {/* Kartu ringkasan atas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Building2} tone="teal" label="OPD SPJT hari ini" value={cards?.opd_spjt_hari_ini ?? "-"} />
        <StatCard icon={CarFront} tone="amber" label="Total kendaraan SPJT" value={totalKt} hint="basis plat KT" />
        <StatCard icon={AlertTriangle} tone="red" label="Kendaraan lewat jatuh tempo" value={cards?.kendaraan_lewat_jatuh_tempo ?? "-"} />
        <StatCard icon={Database} tone="slate" label="Total kendaraan terdata" value={cards?.total_kendaraan_terdata ?? "-"} />
        <StatCard icon={CircleCheck} tone="green" label="Sudah bayar (periode berjalan)" value={cards?.sudah_bayar_periode_berjalan ?? "-"} />
        <StatCard icon={MapPinOff} tone="slate" label="Kendaraan luar daerah" value={cards?.total_kendaraan_non_kt ?? "-"} hint="plat Non-KT" />
        <StatCard icon={UserX} tone="amber" label="Belum balik nama" value={totalBelumBalikNama} />
        <StatCard
          icon={Coins}
          tone="red"
          label="Potensi tunggakan Pokok PKB"
          value={formatRupiahSingkat(cards?.potensi_tunggakan_pokok_pkb ?? 0)}
          hint={`${cards?.jumlah_kendaraan_menunggak ?? 0} kendaraan menunggak`}
        />
      </div>

      {(cards?.kendaraan_belum_warna_plat ?? 0) > 0 && (
        <div className="panel p-4 flex items-start gap-3 border-amber-200 bg-amber-50">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">
              {cards?.kendaraan_belum_warna_plat} kendaraan belum diisi warna plat.
            </p>
            <p className="text-amber-700">
              Untuk sementara dihitung pakai tarif Merah (0,5%) supaya Pokok PKB tidak Rp 0 — isi lewat
              menu{" "}
              <Link href="/import" className="font-medium hover:underline">
                Import Data &gt; Warna plat
              </Link>{" "}
              (massal) atau satu-satu lewat Edit Kendaraan, supaya kendaraan plat hitam (0,8%) terhitung benar.
            </p>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Statistik pembayaran SPJT */}
        <div className="panel">
          <div className="panel-head">
            <Wallet size={16} className="text-primary-600" />
            Statistik pembayaran SPJT
          </div>
          <div className="p-5 space-y-2.5 text-sm">
            <Row label="Total OPD" value={statistikOpd?.length ?? 0} />
            <Row label="Total kendaraan" value={totalKt} />
            <Row label="Sudah bayar" value={totalSudahBayar} badge="badge-sudah-bayar" />
            <Row label="Masih aktif" value={totalMasihAktif} badge="badge-masih-aktif" />
            <Row label="Belum bayar" value={totalBelumBayar} badge="badge-belum-bayar" />
          </div>
          <div className="px-5 pb-5 pt-3 border-t border-line flex items-center justify-between">
            <span className="text-xs text-muted">Persentase kepatuhan</span>
            <span className="text-2xl font-display font-bold text-primary-700">{persentaseKepatuhan}%</span>
          </div>
        </div>

        {/* Efektivitas SPJT */}
        <div className="panel">
          <div className="panel-head">
            <MailCheck size={16} className="text-primary-600" />
            Efektivitas SPJT
          </div>
          <div className="p-5">
            <p className="text-sm text-muted">
              Detail efektivitas — kendaraan pernah SPJT, sudah/belum bayar setelahnya, dan sebaran
              keterlambatan &lt;1 bulan / 1–3 bulan / &gt;3 bulan — tersedia di menu{" "}
              <Link href="/statistik" className="text-primary-600 font-medium hover:underline">
                Statistik
              </Link>{" "}
              setelah login admin.
            </p>
          </div>
        </div>
      </div>

      {/* List OPD perlu SPJT */}
      <div className="panel">
        <div className="panel-head justify-between">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-primary-600" />
            OPD yang perlu dibuatkan SPJT
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Cari OPD..."
              className="text-sm border border-line rounded-lg pl-8 pr-3 py-1.5 w-56 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Nama OPD</th>
              <th className="text-right">Jumlah kendaraan perlu SPJT</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {opdPerluSpjt?.map((o) => (
              <tr key={o.opd_id}>
                <td>
                  <Link href={opdHref(o.opd_id)} className="hover:text-primary-700 font-medium">
                    {o.nama_opd}
                  </Link>
                </td>
                <td className="text-right">{o.jumlah_kendaraan_perlu_spjt}</td>
                <td className="text-right">
                  <Link href={opdHref(o.opd_id)} className="text-primary-600">
                    <ArrowRight size={14} className="inline" />
                  </Link>
                </td>
              </tr>
            ))}
            {(!opdPerluSpjt || opdPerluSpjt.length === 0) && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-6">
                  Tidak ada OPD yang perlu SPJT saat ini
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isAdmin && (
          <p className="text-xs text-muted/70 px-4 py-3 border-t border-line">
            Klik nama OPD untuk melihat detail — perlu login admin.
          </p>
        )}
      </div>

      {/* List OPD dengan kendaraan luar daerah */}
      <div className="panel">
        <div className="panel-head">
          <MapPinOff size={16} className="text-primary-600" />
          Kendaraan luar daerah per OPD
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Nama OPD</th>
              <th className="text-right">Jumlah kendaraan luar daerah</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {opdLuarDaerah.map((o) => (
              <tr key={o.opd_id}>
                <td>
                  <Link href={opdHref(o.opd_id)} className="hover:text-primary-700 font-medium">
                    {o.nama_opd}
                  </Link>
                </td>
                <td className="text-right">
                  <span className="badge-status badge-luar-daerah">{o.total_luar_daerah}</span>
                </td>
                <td className="text-right">
                  <Link href={opdHref(o.opd_id)} className="text-primary-600">
                    <ArrowRight size={14} className="inline" />
                  </Link>
                </td>
              </tr>
            ))}
            {opdLuarDaerah.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-6">
                  Tidak ada kendaraan luar daerah tercatat
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isAdmin && (
          <p className="text-xs text-muted/70 px-4 py-3 border-t border-line">
            Klik nama OPD untuk melihat detail — perlu login admin.
          </p>
        )}
      </div>

      {/* List OPD dengan kendaraan belum balik nama */}
      <div className="panel">
        <div className="panel-head">
          <UserX size={16} className="text-primary-600" />
          Kendaraan belum balik nama per OPD
        </div>
        <table className="w-full table-clean">
          <thead>
            <tr>
              <th>Nama OPD</th>
              <th className="text-right">Jumlah belum balik nama</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {opdBelumBalikNama.map((o) => (
              <tr key={o.opd_id}>
                <td>
                  <Link href={opdHref(o.opd_id)} className="hover:text-primary-700 font-medium">
                    {o.nama_opd}
                  </Link>
                </td>
                <td className="text-right">
                  <span className="badge-status badge-belum-bayar">{o.total_belum_balik_nama}</span>
                </td>
                <td className="text-right">
                  <Link href={opdHref(o.opd_id)} className="text-primary-600">
                    <ArrowRight size={14} className="inline" />
                  </Link>
                </td>
              </tr>
            ))}
            {opdBelumBalikNama.length === 0 && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-6">
                  Tidak ada kendaraan belum balik nama tercatat
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isAdmin && (
          <p className="text-xs text-muted/70 px-4 py-3 border-t border-line">
            Klik nama OPD untuk melihat detail — perlu login admin.
          </p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, badge }: { label: string; value: string | number; badge?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted">{label}</span>
      {badge ? (
        <span className={`badge-status ${badge}`}>{value}</span>
      ) : (
        <span className="font-medium">{value}</span>
      )}
    </div>
  );
}
