import { LucideIcon } from "lucide-react";

type Tone = "teal" | "amber" | "red" | "green" | "slate";

const TONE_STYLES: Record<Tone, { bg: string; text: string }> = {
  teal: { bg: "bg-gradient-to-br from-primary-100 to-primary-200", text: "text-primary-700" },
  amber: { bg: "bg-gradient-to-br from-amber-100 to-amber-200", text: "text-amber-700" },
  red: { bg: "bg-gradient-to-br from-red-100 to-red-200", text: "text-red-700" },
  green: { bg: "bg-gradient-to-br from-emerald-100 to-emerald-200", text: "text-emerald-700" },
  slate: { bg: "bg-gradient-to-br from-slate-100 to-slate-200", text: "text-slate-600" },
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
    <div className="panel p-4 flex items-start gap-3">
      <div className={`icon-chip ${style.bg} ${style.text}`}>
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
