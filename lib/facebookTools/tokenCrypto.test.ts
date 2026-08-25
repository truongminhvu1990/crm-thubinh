import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";

// Facebook Live Comment Shield — token storage must never persist a
// plaintext Page Access Token (module scope requirement). This verifies
// the AES-256-GCM round-trip and the two failure modes that must not
// silently succeed: missing key, tampered ciphertext.

test("encryptToken/decryptToken: round-trips a Page Access Token", async () => {
  process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { encryptToken, decryptToken } = await import("./tokenCrypto");

  const plaintext = "EAABsbCS1234567890examplePageAccessToken";
  const encrypted = encryptToken(plaintext);

  assert.notEqual(encrypted, plaintext);
  assert.equal(decryptToken(encrypted), plaintext);
});

test("encryptToken: two encryptions of the same token produce different ciphertext (random iv)", async () => {
  process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { encryptToken } = await import("./tokenCrypto");

  const a = encryptToken("same-token");
  const b = encryptToken("same-token");
  assert.notEqual(a, b);
});

test("decryptToken: throws instead of returning garbage when the ciphertext was tampered with", async () => {
  process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { encryptToken, decryptToken } = await import("./tokenCrypto");

  const encrypted = encryptToken("a-real-token");
  const [iv, authTag, ciphertext] = encrypted.split(".");
  const tampered = [iv, authTag, Buffer.from(ciphertext, "base64").reverse().toString("base64")].join(".");

  assert.throws(() => decryptToken(tampered));
});

test("encryptToken: throws a clear error when FACEBOOK_TOKEN_ENCRYPTION_KEY is unset", async () => {
  delete process.env.FACEBOOK_TOKEN_ENCRYPTION_KEY;
  const { encryptToken } = await import("./tokenCrypto");

  assert.throws(() => encryptToken("x"), /FACEBOOK_TOKEN_ENCRYPTION_KEY/);
});
