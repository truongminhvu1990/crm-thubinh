// Pure formatting/parsing helpers behind CurrencyInput - kept separate from
// the component so the digit/caret math is unit-testable without React.

/** Strips everything but digits, e.g. "10.900.000 đ" -> "10900000". */
export function parseDigits(input: string): string {
  return input.replace(/\D/g, "");
}

/** Vietnamese thousands grouping: "10900000" -> "10.900.000". Collapses
 * leading zeros ("0123" -> "123", "00" -> "0"). Empty in, empty out. */
export function formatThousands(digits: string): string {
  if (!digits) return "";
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  return trimmed.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Digit string -> the plain number stored in the DB, or undefined if empty. */
export function digitsToNumber(digits: string): number | undefined {
  return digits === "" ? undefined : Number(digits);
}

/** How many digits sit before the caret in the raw (pre-reformat) input -
 * the anchor used to relocate the caret after formatting changes where the
 * "." separators fall. */
export function digitsBeforeCursor(rawInput: string, cursorPos: number): number {
  return parseDigits(rawInput.slice(0, cursorPos)).length;
}

/** Index right after the Nth digit in `formatted`, so the caret lands in
 * the same logical spot regardless of how separators shifted around it. */
export function cursorPositionForDigitCount(formatted: string, digitCount: number): number {
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i])) {
      seen++;
      if (seen === digitCount) return i + 1;
    }
  }
  return formatted.length;
}
