"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  children: ReactNode;
  className?: string;
}

export default function Card({ children, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-[0_1px_2px_rgba(16,12,30,0.04),0_1px_8px_rgba(16,12,30,0.04)] p-5 sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}
