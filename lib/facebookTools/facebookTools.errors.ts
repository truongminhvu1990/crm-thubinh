/** Phase 2J-D — a caller-input validation failure for Facebook Tools
 * (e.g. an empty manual-import URL batch). Same typed-error-class
 * convention as lib/seeding/seeding.errors.ts's SeedingValidationError —
 * the route layer checks `instanceof` to return 400 instead of a generic
 * 500. */
export class FacebookToolsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FacebookToolsValidationError";
  }
}
