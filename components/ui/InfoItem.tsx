"use client";

import { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

export default function InfoItem({ icon, label, children }: Props) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground truncate">{children}</div>
      </div>
    </div>
  );
}
