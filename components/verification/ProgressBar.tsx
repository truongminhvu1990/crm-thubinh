"use client";

interface Props {
  label: string;
  value: number;
  colorClass?: string;
}

export default function ProgressBar({ label, value, colorClass = "bg-primary" }: Props) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${colorClass} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
