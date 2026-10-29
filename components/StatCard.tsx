import { LucideIcon } from "lucide-react";

type Tone = "teal" | "amber" | "red" | "green" | "slate" | "sky" | "violet" | "pink";

// Warna solid per kartu (tanpa gradasi): chip ikon, garis aksen kiri, dan efek hover
const TONE_STYLES: Record<Tone, { chip: string; bar: string }> = {
  teal: { chip: "bg-indigo-500 text-white", bar: "border-l-indigo-500" },
  sky: { chip: "bg-sky-500 text-white", bar: "border-l-sky-500" },
  violet: { chip: "bg-violet-500 text-white", bar: "border-l-violet-500" },
  pink: { chip: "bg-pink-500 text-white", bar: "border-l-pink-500" },
  amber: { chip: "bg-amber-500 text-white", bar: "border-l-amber-500" },
  red: { chip: "bg-rose-500 text-white", bar: "border-l-rose-500" },
  green: { chip: "bg-emerald-500 text-white", bar: "border-l-emerald-500" },
  slate: { chip: "bg-slate-500 text-white", bar: "border-l-slate-500" },
};

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "teal",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  tone?: Tone;
}) {
  const style = TONE_STYLES[tone];

  return (
    <div className={`panel group p-4 flex items-start gap-3 border-l-4 ${style.bar} hover:-translate-y-1`}>
      <div className={`icon-chip ${style.chip} group-hover:scale-110 group-hover:rotate-3`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-display font-bold leading-tight text-ink">{value}</p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
        {hint && <p className="text-[11px] text-muted/70 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
