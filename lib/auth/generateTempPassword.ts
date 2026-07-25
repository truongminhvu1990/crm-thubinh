import { randomInt } from "crypto";

// Excludes visually ambiguous characters (i, l, o, 0, 1) - this password is
// read off a one-time popup and typed once at first login, never stored or
// autofilled anywhere (Business Rule 4/5).
const LOWER = "abcdefghjkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%^&*-_=+";
const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

function pickFrom(charset: string): string {
  return charset[randomInt(charset.length)];
}

/** Cryptographically random (Node's crypto.randomInt, not Math.random)
 * temporary password for newly created staff Auth accounts. Guarantees at
 * least one character from each class so it always clears Supabase Auth's
 * default password-strength policy, then Fisher-Yates shuffles so the
 * guaranteed characters aren't always in the same positions. */
export function generateTempPassword(length = 16): string {
  const chars = [pickFrom(UPPER), pickFrom(LOWER), pickFrom(DIGITS), pickFrom(SYMBOLS)];
  while (chars.length < length) {
    chars.push(pickFrom(ALL));
  }
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
