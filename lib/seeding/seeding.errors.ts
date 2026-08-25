/** Phase 2C — a caller-input/business-rule validation failure (invalid
 * action_type, missing comment_text for a Comment task, an illegal task
 * status transition, a target from the wrong Facebook Page). Same
 * typed-error-class convention as InventoryAdjustmentValidationError
 * (lib/inventoryAdjustment/inventoryAdjustment.service.ts) — the route
 * layer checks `instanceof` to return 400 instead of a generic 500. */
export class SeedingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeedingValidationError";
  }
}
