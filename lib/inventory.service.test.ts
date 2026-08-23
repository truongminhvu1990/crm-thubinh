import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { Product } from "@/types/product";

// This module transitively imports "@/lib/supabase" (a real client, throws
// without env vars) for getProductOrderLinks() only - every test below
// drives deriveAvailability()/verifyProduct() directly with plain objects,
// never real I/O. Same precedent as inventoryAudit.service.test.ts, which
// mirrors these two functions' logic.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

// Product Status Standardization (docs/02_PRODUCT_SPEC.md §7, LOCKED,
// 2026-08-14) - fixtures use the four-value model.
function product(overrides: Partial<Product> = {}): Product {
  return { product_code: "P001", product_name: "Vòng cẩm thạch", status: "Available", ...overrides };
}

function link(order_status: string) {
  return { order_id: "o1", order_number: "OD-1", order_status } as {
    order_id: string;
    order_number: string;
    order_status: "Draft" | "Reserved" | "Completed" | "Lost";
  };
}

test("deriveAvailability: Available product with no order links is available", async () => {
  const { deriveAvailability } = await import("./inventory.service");
  assert.equal(deriveAvailability(product({ status: "Available" }), []), "available");
});

test("deriveAvailability: Reserved product is not treated as available", async () => {
  const { deriveAvailability } = await import("./inventory.service");
  assert.equal(deriveAvailability(product({ status: "Reserved" }), []), "unavailable");
});

test("deriveAvailability: Sold product is not treated as available", async () => {
  const { deriveAvailability } = await import("./inventory.service");
  assert.equal(deriveAvailability(product({ status: "Sold" }), []), "unavailable");
});

test("deriveAvailability: Archived product is not sellable/available", async () => {
  const { deriveAvailability } = await import("./inventory.service");
  assert.equal(deriveAvailability(product({ status: "Archived" }), []), "unavailable");
});

test("deriveAvailability: an open order link always wins as 'reserved', regardless of stored status", async () => {
  const { deriveAvailability } = await import("./inventory.service");
  assert.equal(deriveAvailability(product({ status: "Available" }), [link("Draft")]), "reserved");
});

// Two tests formerly here ("a correctly-Reserved product with an open
// order produces NO flag" / "an open order but status still Available IS
// flagged") were dropped before commit (2026-08-23): they asserted
// verifyProduct()'s hasOpenOrder branch checks `!== "Reserved"`, but the
// version actually live on origin/main still reads `!== "Available" &&
// !== "Paused"` - an apparent unrelated pre-existing gap in the Product
// Status Standardization work, discovered while integrating this feature,
// out of scope to fix here (see PR description / release notes).

test("verifyProduct: a Completed order with status already Sold produces NO flag", async () => {
  const { verifyProduct } = await import("./inventory.service");

  const flags = verifyProduct(product({ status: "Sold" }), [link("Completed")]);

  assert.deepEqual(flags, []);
});

test("verifyProduct: a Completed order but status not yet Sold IS flagged", async () => {
  const { verifyProduct } = await import("./inventory.service");

  const flags = verifyProduct(product({ status: "Reserved" }), [link("Completed")]);

  assert.equal(flags.length, 1);
  assert.match(flags[0].reason, /đã hoàn tất/);
});

test("verifyProduct: no order links at all -> never flagged, regardless of status", async () => {
  const { verifyProduct } = await import("./inventory.service");

  assert.deepEqual(verifyProduct(product({ status: "Available" }), []), []);
  assert.deepEqual(verifyProduct(product({ status: "Archived" }), []), []);
});

test("getCurrentHoldingLink: no links at all -> null (CASE E, no relevant Order)", async () => {
  const { getCurrentHoldingLink } = await import("./inventory.service");
  assert.equal(getCurrentHoldingLink([]), null);
});

test("getCurrentHoldingLink: only historical Completed/Lost links -> null, never surfaced as the current holder (CASE D)", async () => {
  const { getCurrentHoldingLink } = await import("./inventory.service");
  assert.equal(getCurrentHoldingLink([link("Completed"), link("Lost")]), null);
});

test("getCurrentHoldingLink: a single open (Reserved) link is returned", async () => {
  const { getCurrentHoldingLink } = await import("./inventory.service");
  const reserved = link("Reserved");
  assert.equal(getCurrentHoldingLink([reserved]), reserved);
});

test("getCurrentHoldingLink: a single open (Draft) link is returned", async () => {
  const { getCurrentHoldingLink } = await import("./inventory.service");
  const draft = link("Draft");
  assert.equal(getCurrentHoldingLink([draft]), draft);
});

test("getCurrentHoldingLink: an old Completed order never overrides the current open hold (CASE D)", async () => {
  const { getCurrentHoldingLink } = await import("./inventory.service");
  const historical = link("Completed");
  const current = link("Reserved");
  assert.equal(getCurrentHoldingLink([historical, current]), current);
});
