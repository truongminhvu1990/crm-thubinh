"use client";

import { useEffect, useState } from "react";
import { Option } from "@/lib/customer.constants";
import { getMasterDataOptions } from "@/lib/masterData.service";
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
