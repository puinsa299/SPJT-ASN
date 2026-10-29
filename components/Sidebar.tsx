"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutGrid,
  Building2,
  Truck,
  CalendarCheck,
  BarChart3,
  IdCard,
  History,
  FileClock,
  Upload,
  Download,
  Settings,
  LogOut,
  LogIn,
  Lock,
  CarFront,
} from "lucide-react";

const MENU = [
  { href: "/", label: "Dashboard", warna: "bg-indigo-50 text-indigo-600", icon: LayoutGrid },
  { href: "/opd", label: "Data OPD", warna: "bg-sky-50 text-sky-600", icon: Building2 },
  { href: "/kendaraan", label: "Data Kendaraan", warna: "bg-violet-50 text-violet-600", icon: Truck },
  { href: "/spjt-hari-ini", label: "SPJT Hari Ini", warna: "bg-amber-50 text-amber-600", icon: CalendarCheck },
  { href: "/statistik", label: "Statistik", warna: "bg-emerald-50 text-emerald-600", icon: BarChart3 },
  { href: "/profiling", label: "Profiling", warna: "bg-rose-50 text-rose-500", icon: IdCard },
  { href: "/riwayat-spjt", label: "Riwayat SPJT", warna: "bg-orange-50 text-orange-600", icon: History },
  { href: "/histori", label: "Histori Data", warna: "bg-teal-50 text-teal-600", icon: FileClock },
  { href: "/import", label: "Import Data", warna: "bg-blue-50 text-blue-600", icon: Upload },
  { href: "/export", label: "Export Data", warna: "bg-lime-50 text-lime-700", icon: Download },
  { href: "/pengaturan", label: "Pengaturan", warna: "bg-slate-100 text-slate-600", icon: Settings },
];

export default function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <aside
      className="w-64 shrink-0 min-h-screen flex flex-col text-ink border-r border-line relative z-20 bg-white"
      
    >
      <div className="px-5 py-5 flex items-center gap-3 border-b border-line">
        <div className="w-10 h-10 rounded-xl bg-primary-600 text-white flex items-center justify-center">
          <CarFront size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-ink leading-tight">SPJT Kendaraan ASN</p>
          <p className="text-[11px] text-muted">Kaltim &amp; Kota Samarinda</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {MENU.map((item) => {
          const locked = item.href !== "/" && !isAdmin;
          const active = pathname === item.href;
          const Icon = item.icon;

          if (locked) {
            return (
              <Link
                key={item.href}
                href={`/login?redirect=${item.href}`}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-50"
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.warna} opacity-60`}><Icon size={15} /></span>
                <span className="flex-1">{item.label}</span>
                <Lock size={12} />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all hover:translate-x-0.5 ${
                active
                  ? "bg-primary-50 text-primary-700 font-semibold"
                  : "text-slate-600 hover:bg-slate-50 hover:text-ink"
              }`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.warna} transition-transform duration-150 group-hover:scale-105`}>
                <Icon size={15} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-line">
        {isAdmin ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-ink"
          >
            <LogOut size={17} />
            Keluar
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-primary-50 text-primary-700 hover:bg-primary-100"
          >
            <LogIn size={17} />
            Login admin
          </Link>
        )}
        <p className="text-center text-[11px] text-slate-400 mt-3">© 2026 dibuat oleh Hani</p>
      </div>
    </aside>
  );
}
