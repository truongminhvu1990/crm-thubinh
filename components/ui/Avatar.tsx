"use client";

import { cn } from "@/lib/utils";

interface Props {
  name: string;
  vip?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PALETTE = [
  "bg-primary",
  "bg-secondary",
  "bg-indigo-600",
  "bg-fuchsia-600",
  "bg-teal-600",
  "bg-rose-600",
];

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

function getColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const SIZES = {
  sm: "w-10 h-10 text-sm",
  md: "w-14 h-14 text-lg",
  lg: "w-24 h-24 text-3xl",
};

export default function Avatar({ name, vip = false, size = "md", className }: Props) {
  return (
    <div
      className={cn(
        "relative shrink-0 rounded-full flex items-center justify-center font-semibold text-white",
        SIZES[size],
        getColor(name),
        vip && "ring-4 ring-amber-400",
        className
      )}
    >
      {getInitials(name)}
    </div>
  );
}
