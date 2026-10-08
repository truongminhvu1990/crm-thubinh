// Dashboard biểu đồ - Wave A (F2 So sánh kỳ). Pure comparison arithmetic.

export interface DeltaValue {
  current: number | null;
  previous: number | null;
  /** current - previous, null when either side is unknown. */
  delta: number | null;
  /** Percentage change, ONLY when the previous value is a valid denominator (> 0). Otherwise null, and the UI shows a dash:
   * a change from 0 (or from a negative figure) is not a "growth" and is never presented as one. */
  percent: number | null;
}

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function computeDelta(current: number | null | undefined, previous: number | null | undefined): DeltaValue {
  const cur = isNum(current) ? current : null;
  const prev = isNum(previous) ? previous : null;
  if (cur === null || prev === null) return { current: cur, previous: prev, delta: null, percent: null };
  const delta = cur - prev;
  return { current: cur, previous: prev, delta, percent: prev > 0 ? (delta / prev) * 100 : null };
}

/** numerator / denominator, null when the denominator is not positive (an average over zero orders is "no value", not 0). */
export function safeRatio(numerator: number, denominator: number): number | null {
  return isNum(numerator) && isNum(denominator) && denominator > 0 ? numerator / denominator : null;
}
