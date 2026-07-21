import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Shared helpers for fields that store a multi-select as a comma-separated
// string in a single text column (used by both the Customer and Product
// modules) so no field needs its own array/jsonb column.

export function parseMultiValue(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export function serializeMultiValue(values: string[]): string {
  return values.join(",");
}

/** Vietnamese dd/MM/yyyy everywhere - "vi-VN" alone doesn't zero-pad
 * (e.g. "6/11/2026"), so the format options are required to get "06/11/2026". */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Automation List's "Last Run" column (MARKETING_AUTOMATION_UI.md §3.2,
 * "2 giờ trước") - a small, generically useful relative-time formatter, not
 * automation-specific, so it lives alongside formatDate rather than in a
 * module-scoped file. */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} ngày trước`;
  return formatDate(d);
}

/** crypto.randomUUID() isn't available in every runtime (older browsers,
 * and some engines restrict it to secure contexts) - use it when present,
 * otherwise build an RFC4122 v4 UUID from crypto.getRandomValues (or
 * Math.random as a last resort) so ID generation never throws. */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes =
    typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function"
      ? crypto.getRandomValues(new Uint8Array(16))
      : Uint8Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));

  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
