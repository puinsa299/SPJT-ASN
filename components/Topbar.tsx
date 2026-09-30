import { CalendarDays } from "lucide-react";

export default function Topbar() {
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b border-line/70 shadow-sm px-6 py-3 flex items-center">
      <div className="ml-auto flex items-center gap-2 text-sm text-muted">
        <CalendarDays size={16} />
        <span>{today}</span>
      </div>
    </header>
  );
}
