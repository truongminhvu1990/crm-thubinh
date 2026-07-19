"use client";

import { ReactNode } from "react";
import Card from "./Card";

interface Props {
  title: string;
  value: string | number;
  icon: ReactNode;
  color?: string;
  placeholder?: boolean;
  hint?: string;
}

export default function StatCard({
  title,
  value,
  icon,
  color = "bg-primary/10 text-primary",
  placeholder = false,
  hint,
}: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground text-sm">{title}</p>
          <p
            className={`text-2xl font-bold mt-2 ${
              placeholder ? "text-muted-foreground/50" : "text-foreground"
            }`}
          >
            {placeholder ? "—" : value}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>{icon}</div>
      </div>
    </Card>
  );
}
