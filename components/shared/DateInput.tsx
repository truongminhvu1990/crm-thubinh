"use client";

import { useRef, useState } from "react";
import { CalendarDays } from "lucide-react";

// Phase 1.6 / 1.6B - a date field that always DISPLAYS dd/mm/yyyy. A native <input type="date"> renders in the
// browser/OS locale (mm/dd/yyyy on an en-US machine) and CSS cannot change that. The value this component takes and
// emits stays ISO yyyy-mm-dd, so API/DB date semantics are untouched.
//
// Phase 1.6B: a calendar button opens the browser's NATIVE picker through HTMLInputElement.showPicker() on a hidden
// <input type="date"> (no calendar dependency). Picking a day there updates the dd/mm/yyyy text.
//
// Emission rule: by default onChange fires only for a COMPLETE valid date or a fully cleared field, so a consumer that
// refetches on change never sees half-typed values. A caller that needs to know "the field is currently invalid"
// (the Global Date Filter's draft) passes emitPartial: a half-typed / impossible date then emits "".

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
export function maskDmy(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

interface Props {
  /** ISO yyyy-mm-dd, or "". */
  value: string;
  /** Called with ISO yyyy-mm-dd when a real date is typed/picked, "" when cleared (see emitPartial for invalid text). */
  onChange: (iso: string) => void;
  /** Also emit "" while the text is half-typed or not a real date. Default false. */
  emitPartial?: boolean;
  /** Show the calendar button (native showPicker). Default true. */
  picker?: boolean;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  id?: string;
  disabled?: boolean;
}

export default function DateInput({ value, onChange, emitPartial = false, picker = true, className, disabled, id, ...rest }: Props) {
  const [text, setText] = useState(() => isoToDmy(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Follow external changes (preset applied, reset) without clobbering a half-typed value that already maps to the same
  // ISO. Derived during render (React's "adjust state when a prop changes"), not in an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (dmyToIso(text) !== (value || null) && !(!value && !text)) setText(isoToDmy(value));
  }

  const invalid = text.length === 10 && dmyToIso(text) === null;

  function commitText(raw: string) {
    const next = maskDmy(raw);
    setText(next);
    if (next === "") return onChange("");
    const iso = dmyToIso(next);
    if (iso) return onChange(iso);
    if (emitPartial) onChange("");
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      // showPicker can throw (unsupported browser / no user activation): fall back to focusing the native control.
      el.focus();
    }
  }

  const input = (
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
      onChange={(e) => commitText(e.target.value)}
      onBlur={() => {
        // A half-typed value that was never emitted must not stay on screen pretending to be the field's value.
        if (!emitPartial && text !== "" && dmyToIso(text) === null) setText(isoToDmy(value));
      }}
      className={className}
      style={picker ? { paddingRight: "2.25rem" } : undefined}
    />
  );

  if (!picker) return input;

  return (
    <span className="relative inline-block">
      {input}
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Chọn ngày"
        data-testid={rest["data-testid"] ? `${rest["data-testid"]}-picker` : undefined}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>
      {/* Hidden native control: only used to show the browser's calendar; the visible text field is the source of display. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => {
          const iso = e.target.value;
          setText(isoToDmy(iso));
          onChange(iso);
        }}
        className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        data-testid={rest["data-testid"] ? `${rest["data-testid"]}-native` : undefined}
      />
    </span>
  );
}
