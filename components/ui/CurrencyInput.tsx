"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  parseDigits,
  formatThousands,
  digitsToNumber,
  digitsBeforeCursor,
  cursorPositionForDigitCount,
} from "@/lib/format/currencyInput";

interface CurrencyInputProps {
  label?: string;
  placeholder?: string;
  value: number | string | null | undefined;
  onChange: (value: number | undefined) => void;
  error?: string;
  icon?: React.ReactNode;
  id?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** QA Test IDs Foundation - stable selector, e.g. "product-cost-price-input". */
  testId?: string;
}

function digitsFromValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "";
  return String(Math.trunc(numeric));
}

/** Vietnamese-thousands-formatted money input ("10900000" displays as
 * "10.900.000" while typing) that still hands the parent a plain number for
 * storage - only the display is masked, never the value. Caret position is
 * preserved across reformatting (typing/deleting/pasting anywhere in the
 * field), and `inputMode="numeric"` brings up the numeric keypad on mobile. */
export default function CurrencyInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  icon,
  id,
  className,
  disabled,
  autoFocus,
  testId,
}: CurrencyInputProps) {
  const [display, setDisplay] = useState(() => formatThousands(digitsFromValue(value)));
  const [lastSyncedValue, setLastSyncedValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCursorDigitCount = useRef<number | null>(null);

  // Resync when the parent's underlying value changes for a reason other
  // than this input's own onChange round-trip (e.g. switching records,
  // form reset) - a no-op while the user is actively typing, since the
  // digits computed from `value` will already match `display`. Adjusted
  // during render (React's documented pattern for deriving state from a
  // changed prop) rather than in an effect, to avoid an extra render pass.
  if (value !== lastSyncedValue) {
    const incomingDigits = digitsFromValue(value);
    if (parseDigits(display) !== incomingDigits) {
      setDisplay(formatThousands(incomingDigits));
    }
    setLastSyncedValue(value);
  }

  useLayoutEffect(() => {
    if (pendingCursorDigitCount.current !== null && inputRef.current) {
      const pos = cursorPositionForDigitCount(display, pendingCursorDigitCount.current);
      inputRef.current.setSelectionRange(pos, pos);
      pendingCursorDigitCount.current = null;
    }
  }, [display]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cursor = e.target.selectionStart ?? raw.length;
    pendingCursorDigitCount.current = digitsBeforeCursor(raw, cursor);

    const digits = parseDigits(raw);
    setDisplay(formatThousands(digits));
    onChange(digitsToNumber(digits));
  }

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <input
          ref={inputRef}
          id={id}
          data-testid={testId}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={display}
          onChange={handleChange}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            "w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors",
            "placeholder:text-muted-foreground",
            "focus:border-primary focus:ring-2 focus:ring-primary/20",
            error ? "border-destructive" : "border-input",
            icon ? "pl-10" : "",
            className
          )}
        />
      </div>
      {error && <p className="text-destructive text-xs mt-1">{error}</p>}
    </div>
  );
}
