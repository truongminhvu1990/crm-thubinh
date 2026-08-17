"use client";

import { useEffect, useState } from "react";
import { Option } from "@/lib/customer.constants";
import { getMasterDataOptions, getMasterDataOptionsWithId } from "@/lib/masterData.service";
import { parseMultiValue } from "@/lib/utils";
import { MasterDataCategory } from "@/types/masterData";

/**
 * Fetches the active options for a master data category, then makes sure
 * any value(s) already stored on the record being edited (a legacy value
 * that was never seeded, or one that's since been disabled/deleted) still
 * appear as selectable so the field doesn't render blank. `currentValue`
 * accepts either a single value or a comma-separated multi-select string.
 */
export function useMasterDataOptions(
  category: MasterDataCategory,
  currentValue?: string | null
): Option[] {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    getMasterDataOptions(category).then((data) => {
      if (active) setOptions(data);
    });
    return () => {
      active = false;
    };
  }, [category]);

  const missing = parseMultiValue(currentValue).filter(
    (v) => !options.some((o) => o.value === v)
  );

  if (missing.length === 0) return options;
  return [...options, ...missing.map((v) => ({ value: v, label: v }))];
}

/** Dev fix (2026-08-17) — the id-valued counterpart to useMasterDataOptions
 * above, for fields that store a real UUID FK to master_data.id rather
 * than the plain text `value` column (currently: receiving_accounts.
 * bank_id). `currentValue` here is a single master_data.id, never a
 * comma-separated multi-value string — this field is never a multi-select.
 * The "missing" fallback (an id that no longer matches an active option,
 * e.g. the bank was deactivated after this account was created) shows the
 * raw id as its own label, same degraded-but-visible behavior the
 * text-valued hook already has for a stale value. */
export function useMasterDataIdOptions(
  category: MasterDataCategory,
  currentValue?: string | null
): Option[] {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    getMasterDataOptionsWithId(category).then((data) => {
      if (active) setOptions(data);
    });
    return () => {
      active = false;
    };
  }, [category]);

  if (!currentValue || options.some((o) => o.value === currentValue)) return options;
  return [...options, { value: currentValue, label: currentValue }];
}
