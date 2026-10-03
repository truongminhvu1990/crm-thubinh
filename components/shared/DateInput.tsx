"use client";

import { useState } from "react";

// Phase 1.6 - a date field that always DISPLAYS dd/mm/yyyy. A native
// <input type="date"> renders in the browser/OS locale (mm/dd/yyyy on an
// en-US machine) and CSS cannot change that. The value this component takes
// and emits stays ISO yyyy-mm-dd ("" when empty/incomplete), so API/DB date
// semantics are untouched.

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const DMY = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function isoToDmy(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** dd/mm/yyyy -> yyyy-mm-dd, or null when not a real calendar date. */
export function dmyToIso(text: string): string | null {
  const m = DMY.exec(text.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (d.getUTCFullYear() !== Number(yyyy) || d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Auto-inserts "/" while typing digits. */
function mask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface Props {
  /** ISO yyyy-mm-dd, or "". */
  value: string;
  /** Called with ISO yyyy-mm-dd when a real date is typed, "" when cleared. */
  onChange: (iso: string) => void;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  id?: string;
  disabled?: boolean;
}

export default function DateInput({ value, onChange, className, disabled, id, ...rest }: Props) {
  const [text, setText] = useState(() => isoToDmy(value));

  // Follow external changes (preset applied, reset) without clobbering a
  // half-typed value that already maps to the same ISO. Derived during render
  // (React's "adjust state when a prop changes"), not in an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (dmyToIso(text) !== (value || null) && !(!value && !text)) setText(isoToDmy(value));
  }

  const invalid = text.length === 10 && dmyToIso(text) === null;

  return (
    <input
      {...rest}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => {
        const next = mask(e.target.value);
        setText(next);
        if (next === "") onChange("");
        else {
          const iso = dmyToIso(next);
          onChange(iso ?? "");
        }
      }}
      className={className}
    />
  );
}
