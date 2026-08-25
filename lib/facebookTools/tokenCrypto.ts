import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

/** Facebook Page Access Tokens are secrets equivalent to a password for the
 * connected Page — CLAUDE.md/the module spec both require "không lưu access
 * token dạng plain text." AES-256-GCM via Node's built-in `crypto` (no new
 * dependency, same "use the platform" convention as crypto.randomUUID()
 * already used in app/api/orders/[id]/route.ts).
 *
 * Deliberately NOT added to lib/env.ts's REQUIRED_ENV_VARS / validateEnv():
 * that check runs at app boot (instrumentation.ts) for every route, and this
 * key won't exist until a Meta App is actually connected — failing the
 * whole app's startup for an unused module would be worse than failing only
 * the one encrypt/decrypt call that needs it. */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function loadKey(): Buffer {
  const raw = process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "FACEBOOK_TOKEN_ENCRYPTION_KEY is not set — required to encrypt/decrypt Facebook Page Access Tokens. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("FACEBOOK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded).");
  }
  return key;
}

/** Output layout: base64(iv) + "." + base64(authTag) + "." + base64(ciphertext) —
 * plain string so it fits the `text` column facebook_pages.access_token_encrypted
 * without a separate binary format. */
export function encryptToken(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptToken(encrypted: string): string {
  const key = loadKey();
  const [ivPart, authTagPart, ciphertextPart] = encrypted.split(".");
  if (!ivPart || !authTagPart || !ciphertextPart) {
    throw new Error("Malformed encrypted token — expected iv.authTag.ciphertext.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64")), decipher.final()]);
  return plaintext.toString("utf8");
}
