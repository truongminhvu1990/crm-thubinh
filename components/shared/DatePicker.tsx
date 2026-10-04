"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, KeyboardEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { BusinessTime } from "@/lib/businessTime";
import { WEEKDAY_LABELS, clampIso, isWithin, monthGrid, monthLabel, moveByKey, parseIso, shiftMonths } from "@/lib/calendarGrid";

// Phase 1.6B.1 - the ONE reusable date field for reporting.
//
//  - The field displays dd/mm/yyyy; the value it takes and emits is ISO yyyy-mm-dd (API / DB contract untouched).
//  - Clicking the field (or the calendar button) opens an in-page calendar. Phase 1.6B used a hidden native
//    <input type="date"> + showPicker(); WebKit/Safari builds that do not implement the native date control accept the
//    call silently and show nothing, so selecting a date was impossible without typing. This calendar is plain DOM and
//    behaves the same in every browser, desktop and mobile. No calendar dependency.
//  - Typing stays supported (desktop). On touch devices the field is read-only so the keyboard never covers the calendar.
//  - PRESENTATION ONLY: no reporting-period logic lives here. "Today" is used purely to highlight a cell / pick the month
//    shown for an empty field.
//
// Emission rule: onChange fires only for a COMPLETE valid date or a fully cleared field, unless `emitPartial` is set (the
// Global Date Filter draft needs to know a half-typed date is invalid): then an invalid text emits "".

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

// Touch devices: the calendar is the input method (read-only field => no on-screen keyboard over the popup).
function subscribeCoarse(cb: () => void) {
  const mq = window.matchMedia("(pointer: coarse)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getCoarse = () => window.matchMedia("(pointer: coarse)").matches;
const getCoarseServer = () => false;

interface Props {
  /** ISO yyyy-mm-dd, or "". */
  value: string;
  /** Called with ISO yyyy-mm-dd when a date is typed/picked, "" when cleared (see emitPartial for invalid text). */
  onChange: (iso: string) => void;
  /** Also emit "" while the text is half-typed or not a real date. Default false. */
  emitPartial?: boolean;
  /** Show the calendar button + popup. Default true. */
  picker?: boolean;
  /** Optional inclusive bounds (ISO). Days outside are disabled in the calendar and rejected when typed. */
  min?: string;
  max?: string;
  className?: string;
  "aria-label"?: string;
  "data-testid"?: string;
  id?: string;
  disabled?: boolean;
}

interface Placement {
  alignRight: boolean;
  up: boolean;
}

const POPUP_WIDTH = 288; // px (w-72)
const POPUP_HEIGHT = 340; // px, approximate - only used to decide whether to open upwards

export default function DatePicker({ value, onChange, emitPartial = false, picker = true, min, max, className, disabled, id, ...rest }: Props) {
  const [text, setText] = useState(() => isoToDmy(value));
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>({ alignRight: false, up: false });
  const [view, setView] = useState<{ y: number; m: number }>({ y: 2000, m: 1 });
  const [focusIso, setFocusIso] = useState("");
  const [focusGrid, setFocusGrid] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupId = useId();
  const coarse = useSyncExternalStore(subscribeCoarse, getCoarse, getCoarseServer);
  const testId = rest["data-testid"];

  // Follow external changes (preset applied, reset) without clobbering a half-typed value that already maps to the same
  // ISO. Derived during render (React's "adjust state when a prop changes"), not in an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (dmyToIso(text) !== (value || null) && !(!value && !text)) setText(isoToDmy(value));
  }

  const invalid = text.length === 10 && dmyToIso(text) === null;
  const parsedValue = parseIso(value) ? value : "";

  function acceptable(iso: string) {
    return isWithin(iso, min, max);
  }

  function commitText(raw: string) {
    const next = maskDmy(raw);
    setText(next);
    if (next === "") return onChange("");
    const iso = dmyToIso(next);
    if (iso && acceptable(iso)) return onChange(iso);
    if (emitPartial) onChange("");
  }

  function openCalendar(viaButton: boolean) {
    if (disabled) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) {
      setPlacement({
        // keep the 288px popup inside the viewport horizontally; open upwards when there is no room below
        alignRight: rect.left + POPUP_WIDTH > window.innerWidth - 8 && rect.right - POPUP_WIDTH >= 8,
        up: rect.bottom + POPUP_HEIGHT > window.innerHeight && rect.top > POPUP_HEIGHT,
      });
    }
    const start = clampIso(parsedValue || BusinessTime.todayString(), min, max);
    const p = parseIso(start);
    if (p) setView({ y: p.y, m: p.m });
    setFocusIso(start);
    setFocusGrid(viaButton);
    setOpen(true);
  }

  function closeCalendar(returnFocus: boolean) {
    setOpen(false);
    setFocusGrid(false);
    if (returnFocus) inputRef.current?.focus();
  }

  function selectDay(iso: string) {
    if (!acceptable(iso)) return;
    setText(isoToDmy(iso));
    onChange(iso);
    closeCalendar(true);
  }

  // Outside click / tap closes; Escape closes (captured on window so a host Radix Dialog does not also close).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
      setFocusGrid(false);
      inputRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  // Move DOM focus to the highlighted day when the calendar was opened from the button or navigated with the keyboard.
  useEffect(() => {
    if (!open || !focusGrid) return;
    wrapRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusIso}"]`)?.focus();
  }, [open, focusGrid, focusIso, view.y, view.m]);

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") return;
    const next = moveByKey(focusIso, e.key);
    if (!next) return;
    e.preventDefault();
    const bounded = clampIso(next, min, max);
    const p = parseIso(bounded);
    setFocusIso(bounded);
    setFocusGrid(true);
    if (p && (p.y !== view.y || p.m !== view.m)) setView({ y: p.y, m: p.m });
  }

  function shiftView(delta: number) {
    const moved = shiftMonths(`${String(view.y).padStart(4, "0")}-${String(view.m).padStart(2, "0")}-01`, delta);
    const p = parseIso(moved);
    if (!p) return;
    setView({ y: p.y, m: p.m });
    // keep the roving highlight inside the month now on screen
    setFocusIso(shiftMonths(focusIso, delta));
  }

  const today = BusinessTime.todayString();
  const cells = open ? monthGrid(view.y, view.m) : [];

  const input = (
    <input
      {...rest}
      ref={inputRef}
      id={id}
      type="text"
      inputMode={coarse ? "none" : "numeric"}
      readOnly={coarse && picker}
      autoComplete="off"
      placeholder="dd/mm/yyyy"
      maxLength={10}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      aria-haspopup={picker ? "dialog" : undefined}
      aria-controls={picker && open ? popupId : undefined}
      value={text}
      onChange={(e) => commitText(e.target.value)}
      onClick={() => picker && !open && openCalendar(false)}
      onKeyDown={(e) => {
        if (!picker) return;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          openCalendar(true);
        }
      }}
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
    <span ref={wrapRef} className="relative inline-block">
      {input}
      <button
        type="button"
        onClick={() => (open ? closeCalendar(false) : openCalendar(true))}
        disabled={disabled}
        aria-label="Chọn ngày"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid={testId ? `${testId}-picker` : undefined}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={popupId}
          role="dialog"
          aria-label="Chọn ngày"
          data-testid="date-calendar"
          className={`absolute z-[70] w-72 rounded-xl border border-border bg-card p-3 text-foreground shadow-lg ${placement.alignRight ? "right-0" : "left-0"} ${placement.up ? "bottom-full mb-1" : "top-full mt-1"}`}
          style={{ maxWidth: "calc(100vw - 1rem)" }}
          onKeyDown={onGridKeyDown}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftView(-1)}
              aria-label="Tháng trước"
              data-testid="date-calendar-prev"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="text-sm font-semibold" aria-live="polite" data-testid="date-calendar-month">
              {monthLabel(view.y, view.m)}
            </span>
            <button
              type="button"
              onClick={() => shiftView(1)}
              aria-label="Tháng sau"
              data-testid="date-calendar-next"
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-muted-foreground" aria-hidden="true">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5" role="grid">
            {cells.map((c) => {
              const selected = c.iso === parsedValue;
              const allowed = acceptable(c.iso);
              return (
                <button
                  key={c.iso}
                  type="button"
                  role="gridcell"
                  data-date={c.iso}
                  aria-label={isoToDmy(c.iso)}
                  aria-selected={selected}
                  disabled={!allowed}
                  tabIndex={c.iso === focusIso ? 0 : -1}
                  onClick={() => selectDay(c.iso)}
                  onFocus={() => setFocusIso(c.iso)}
                  className={[
                    "h-9 w-9 rounded-md text-sm tabular-nums",
                    selected ? "bg-primary text-primary-foreground font-semibold" : c.inMonth ? "hover:bg-muted" : "text-muted-foreground/60 hover:bg-muted",
                    c.iso === today && !selected ? "ring-1 ring-primary" : "",
                    !allowed ? "cursor-not-allowed opacity-30 hover:bg-transparent" : "",
                  ].join(" ")}
                >
                  {c.day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setText("");
                onChange("");
                closeCalendar(true);
              }}
              data-testid="date-calendar-clear"
              className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Xóa
            </button>
          </div>
        </div>
      )}
    </span>
  );
}
