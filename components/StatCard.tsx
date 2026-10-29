import { LucideIcon } from "lucide-react";

type Tone = "teal" | "amber" | "red" | "green" | "slate" | "sky" | "violet" | "pink";

// Warna solid per kartu (tanpa gradasi): chip ikon, garis aksen kiri, dan efek hover
const TONE_STYLES: Record<Tone, { chip: string }> = {
  teal: { chip: "bg-primary-50 text-primary-600" },
  sky: { chip: "bg-sky-50 text-sky-600" },
  violet: { chip: "bg-violet-50 text-violet-600" },
  pink: { chip: "bg-rose-50 text-rose-500" },
  amber: { chip: "bg-amber-50 text-amber-600" },
  red: { chip: "bg-rose-50 text-rose-600" },
  green: { chip: "bg-emerald-50 text-emerald-600" },
  slate: { chip: "bg-slate-100 text-slate-600" },
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
    <div className="panel group p-4 flex items-start gap-3 min-w-0 hover:-translate-y-0.5">
      <div className={`icon-chip ${style.chip} group-hover:scale-105`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold leading-tight text-ink break-words">{value}</p>
        <p className="text-xs text-muted mt-0.5 break-words">{label}</p>
        {hint && <p className="text-[11px] text-muted/70 mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}
