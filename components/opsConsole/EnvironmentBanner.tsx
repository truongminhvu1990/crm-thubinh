"use client";

import { AlertTriangle, FlaskConical, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { EnvironmentKey, ENVIRONMENTS } from "@/lib/opsConsole/opsConsole.constants";

interface Props {
  /** When set, renders one prominent banner for that environment (multi-
   * environment screens: Environment Status, Backup Status, Restore
   * History, Migration History - PRODUCTION_READINESS_UI.md §2.1). When
   * omitted, renders a compact all-three summary (environment-agnostic
   * screens: Dashboard, Audit Overview, Access Control). */
  activeEnvironment?: EnvironmentKey;
}

const STYLE: Record<EnvironmentKey, { icon: typeof Info; classes: string; note?: string }> = {
  development: { icon: Info, classes: "bg-sky-50 text-sky-800 border-sky-200" },
  staging: {
    icon: FlaskConical,
    classes: "bg-amber-50 text-amber-800 border-amber-200",
    note: "Chưa khởi tạo — môi trường diễn tập này chưa tồn tại (PRODUCTION_READINESS_DATABASE.md §2)",
  },
  production: { icon: AlertTriangle, classes: "bg-red-50 text-red-800 border-red-300" },
};

/** Environment Banner (Decision 32) - persistent, visually distinct per
 * environment so a glance (or a screenshot) is always enough to tell
 * Development/Staging/Production apart. Production is deliberately the
 * most visually assertive of the three. */
export default function EnvironmentBanner({ activeEnvironment }: Props) {
  if (activeEnvironment) {
    const env = ENVIRONMENTS.find((e) => e.key === activeEnvironment)!;
    const style = STYLE[activeEnvironment];
    const Icon = style.icon;
    return (
      <div className={cn("mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium", style.classes)}>
        <Icon className="w-4 h-4 shrink-0" />
        <span>{env.label}</span>
        {style.note && <span className="font-normal text-xs opacity-80">— {style.note}</span>}
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {ENVIRONMENTS.map((env) => {
        const style = STYLE[env.key];
        const Icon = style.icon;
        return (
          <span
            key={env.key}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", style.classes)}
          >
            <Icon className="w-3.5 h-3.5" />
            {env.label}
          </span>
        );
      })}
    </div>
  );
}
