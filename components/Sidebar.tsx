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
  { href: "/", label: "Dashboard", icon: LayoutGrid },
  { href: "/opd", label: "Data OPD", icon: Building2 },
  { href: "/kendaraan", label: "Data Kendaraan", icon: Truck },
  { href: "/spjt-hari-ini", label: "SPJT Hari Ini", icon: CalendarCheck },
  { href: "/statistik", label: "Statistik", icon: BarChart3 },
  { href: "/profiling", label: "Profiling", icon: IdCard },
  { href: "/riwayat-spjt", label: "Riwayat SPJT", icon: History },
  { href: "/histori", label: "Histori Data", icon: FileClock },
  { href: "/import", label: "Import Data", icon: Upload },
  { href: "/export", label: "Export Data", icon: Download },
  { href: "/pengaturan", label: "Pengaturan", icon: Settings },
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
      className="w-64 shrink-0 min-h-screen flex flex-col text-white/90 shadow-lift relative z-20"
      style={{ background: "linear-gradient(180deg, #073d30, #0f8a6a)" }}
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
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/45 hover:bg-white/5 hover:text-white/70"
              >
                <Icon size={17} />
                <span className="flex-1">{item.label}</span>
                <Lock size={12} />
              </Link>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                active
                  ? "bg-white/15 text-white font-medium"
                  : "text-white/75 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon size={17} />
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
      </div>
    </aside>
  );
}
