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
  { href: "/", label: "Dashboard", warna: "bg-white/10 text-white", icon: LayoutGrid },
  { href: "/opd", label: "Data OPD", warna: "bg-white/10 text-white", icon: Building2 },
  { href: "/kendaraan", label: "Data Kendaraan", warna: "bg-white/10 text-white", icon: Truck },
  { href: "/spjt-hari-ini", label: "SPJT Hari Ini", warna: "bg-white/10 text-white", icon: CalendarCheck },
  { href: "/statistik", label: "Statistik", warna: "bg-white/10 text-white", icon: BarChart3 },
  { href: "/profiling", label: "Profiling", warna: "bg-white/10 text-white", icon: IdCard },
  { href: "/riwayat-spjt", label: "Riwayat SPJT", warna: "bg-white/10 text-white", icon: History },
  { href: "/histori", label: "Histori Data", warna: "bg-white/10 text-white", icon: FileClock },
  { href: "/import", label: "Import Data", warna: "bg-white/10 text-white", icon: Upload },
  { href: "/export", label: "Export Data", warna: "bg-white/10 text-white", icon: Download },
  { href: "/pengaturan", label: "Pengaturan", warna: "bg-white/10 text-white", icon: Settings },
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
      className="w-64 shrink-0 min-h-screen flex flex-col text-white/90 shadow-lift relative z-20 bg-primary-900"
      
    >
      <div className="px-5 py-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-10 h-10 rounded-xl bg-white text-primary-700 flex items-center justify-center">
          <CarFront size={20} />
        </div>
        <div>
          <p className="text-sm font-semibold text-white leading-tight">SPJT Kendaraan ASN</p>
          <p className="text-[11px] text-white/60">Kaltim &amp; Kota Samarinda</p>
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
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/45 hover:bg-white/5"
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.warna} opacity-50`}><Icon size={15} /></span>
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
                  ? "bg-white/15 text-white font-semibold"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${item.warna} transition-all duration-150 group-hover:scale-105 group-hover:bg-white/20 ${active ? "bg-white/25" : ""}`}>
                <Icon size={15} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        {isAdmin ? (
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/75 hover:bg-white/10 hover:text-white"
          >
            <LogOut size={17} />
            Keluar
          </button>
        ) : (
          <Link
            href="/login"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm bg-white/10 text-white hover:bg-white/15"
          >
            <LogIn size={17} />
            Login admin
          </Link>
        )}
        <p className="text-center text-[11px] text-white/40 mt-3">© 2026 dibuat oleh Hani</p>
      </div>
    </aside>
  );
}
