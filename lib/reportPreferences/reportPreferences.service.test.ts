import test from "node:test";
import assert from "node:assert/strict";
import { mergeColumnPreferenceForSave, resolveEffectiveVisibleColumns } from "./reportPreferences.service";

// resolveEffectiveVisibleColumns — Rule 1 (§15/§16 of the Product Owner
// task): effective = stored INTERSECT available; no stored preference =
// every available column.

test("resolveEffectiveVisibleColumns: no saved preference -> all available columns visible", () => {
  const result = resolveEffectiveVisibleColumns(null, ["sale_date", "customer", "product_name"]);
  assert.deepEqual([...result].sort(), ["customer", "product_name", "sale_date"]);
});

test("resolveEffectiveVisibleColumns: stored preference hides a column the user chose to hide", () => {
  const result = resolveEffectiveVisibleColumns(["sale_date", "product_name"], ["sale_date", "customer", "product_name"]);
  assert.equal(result.has("customer"), false);
  assert.equal(result.has("sale_date"), true);
  assert.equal(result.has("product_name"), true);
});

test("resolveEffectiveVisibleColumns: role-gated column cannot be enabled through a stale stored preference", () => {
  // User previously saved "profit" as visible while they had access; role
  // changed since, so "profit" is no longer in availableKeys at all.
  const result = resolveEffectiveVisibleColumns(["sale_date", "profit"], ["sale_date", "customer"]);
  assert.equal(result.has("profit"), false);
  assert.deepEqual([...result].sort(), ["sale_date"]);
});

test("resolveEffectiveVisibleColumns: stored preference referencing an unknown/retired column key is dropped, not rendered", () => {
  const result = resolveEffectiveVisibleColumns(["sale_date", "retired_column"], ["sale_date", "customer"]);
  assert.deepEqual([...result].sort(), ["sale_date"]);
});

// mergeColumnPreferenceForSave — Rule 2: saving a new selection must never
// silently delete a saved choice for a column that's only temporarily
// unavailable (role/mode gate), only overwrite the toggleable portion.

test("mergeColumnPreferenceForSave: first save with no prior preference persists exactly what was toggled", () => {
  const result = mergeColumnPreferenceForSave(null, ["sale_date", "customer"], new Set(["sale_date"]));
  assert.deepEqual(result.sort(), ["sale_date"]);
});

test("mergeColumnPreferenceForSave: a column outside current availability is preserved in storage even though it wasn't toggleable this save", () => {
  // User previously had "profit" saved as visible (Owner/Manager), then
  // toggled Verification Mode on (a different gate) and hid one column -
  // "profit" must survive in the stored array even though this save's
  // available/toggle set never mentions it.
  const previousStored = ["sale_date", "profit"];
  const availableKeys = ["sale_date", "customer"]; // "profit" not available right now
  const newlyToggled = new Set(["sale_date", "customer"]);

  const result = mergeColumnPreferenceForSave(previousStored, availableKeys, newlyToggled);
  assert.deepEqual(result.sort(), ["customer", "profit", "sale_date"]);
});

test("mergeColumnPreferenceForSave: toggling off a currently-available column actually removes it from storage", () => {
  const previousStored = ["sale_date", "customer"];
  const availableKeys = ["sale_date", "customer"];
  const newlyToggled = new Set(["sale_date"]); // customer unchecked

  const result = mergeColumnPreferenceForSave(previousStored, availableKeys, newlyToggled);
  assert.deepEqual(result.sort(), ["sale_date"]);
});

test("mergeColumnPreferenceForSave: round-trips through resolveEffectiveVisibleColumns once availability is restored", () => {
  // Simulates: save while "profit" unavailable (preserved in storage) ->
  // role restored -> effective columns include "profit" again untouched.
  const afterSave = mergeColumnPreferenceForSave(["sale_date", "profit"], ["sale_date", "customer"], new Set(["sale_date"]));
  const effectiveAfterRoleRestored = resolveEffectiveVisibleColumns(afterSave, ["sale_date", "customer", "profit"]);
  assert.equal(effectiveAfterRoleRestored.has("profit"), true);
  assert.equal(effectiveAfterRoleRestored.has("sale_date"), true);
  assert.equal(effectiveAfterRoleRestored.has("customer"), false);
});
