/**
 * Pure logic — no I/O. Two rules from the Product Owner spec (§15/§16),
 * both load-bearing enough to be unit-tested in isolation rather than
 * inlined into the hook:
 *
 * 1. Effective visible columns = stored preference INTERSECT currently
 *    available columns. No saved preference -> all available columns
 *    visible (preserves current behavior for a first-time user).
 * 2. A previously-saved column that's temporarily unavailable (role
 *    change, a mode toggle like Sales Ledger's Verification Mode) must
 *    never be silently dropped from what's actually persisted — only from
 *    what renders/exports right now. Saving a new selection must therefore
 *    preserve whatever the user had stored for keys outside their current
 *    availability, and only overwrite the portion that was actually
 *    toggleable.
 */

/** Rule 1. `stored: null` means no preference has ever been saved. */
export function resolveEffectiveVisibleColumns<K extends string>(stored: K[] | null, availableKeys: K[]): Set<K> {
  const available = new Set(availableKeys);
  if (stored === null) return available;
  return new Set(stored.filter((k) => available.has(k)));
}

/** Rule 2. `previousStored` is the raw value last read from the backend
 * (or null if none existed yet); `newlyToggledWithinAvailable` is exactly
 * what the ColumnPicker just produced — by construction, a subset of
 * `availableKeys`, since the picker only ever offers currently-available
 * columns. Returns the full raw array to persist. */
export function mergeColumnPreferenceForSave<K extends string>(
  previousStored: K[] | null,
  availableKeys: K[],
  newlyToggledWithinAvailable: Set<K>
): K[] {
  const available = new Set(availableKeys);
  const preservedOutsideAvailability = (previousStored ?? []).filter((k) => !available.has(k));
  return [...preservedOutsideAvailability, ...newlyToggledWithinAvailable];
}
