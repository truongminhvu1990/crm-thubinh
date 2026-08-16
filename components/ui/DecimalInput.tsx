"use client";

import { cn } from "@/lib/utils";

interface DecimalInputProps {
  label?: string;
  placeholder?: string;
  value: number | string | null | undefined;
  onChange: (value: number | undefined) => void;
  error?: string;
  className?: string;
  disabled?: boolean;
  testId?: string;
  /** Max decimal places accepted while typing — CNY amounts and FX rates
   * both need real fractional precision, unlike VND (see
   * lib/format/currencyInput.ts, which is digit-stripping/integer-only by
   * design and is not reused here per docs/19_MONEY_DEBT_LEDGER_SPEC.md
   * §22/§32 — using it for CNY/FX would silently truncate decimals). */
  maxDecimals?: number;
}

/** Plain decimal-capable number input for CNY amounts and FX rates — the
 * smallest correct input path for values `CurrencyInput` (VND-only,
 * integer/digit-stripping) cannot represent. No thousands-grouping display
 * masking (unlike CurrencyInput) — kept deliberately simple, matching this
 * module's "avoid speculative fields/complexity" scope discipline. */
export default function DecimalInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  className,
  disabled,
  testId,
  maxDecimals = 4,
}: DecimalInputProps) {
  const display = value === null || value === undefined || value === "" ? "" : String(value);
  const decimalPattern = new RegExp(`^\\d*(\\.\\d{0,${maxDecimals}})?$`);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    if (raw !== "" && !decimalPattern.test(raw)) return;
    onChange(raw === "" ? undefined : Number(raw));
  }

  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>}
      <input
        data-testid={testId}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        disabled={disabled}
        className={cn(
          "w-full rounded-lg border bg-card px-3 py-2 text-sm outline-none transition-colors",
          "placeholder:text-muted-foreground",
          "focus:border-primary focus:ring-2 focus:ring-primary/20",
          error ? "border-destructive" : "border-input",
          className
        )}
      />
      {error && <p className="text-destructive text-xs mt-1">{error}</p>}
    </div>
  );
}
