"use client";

import { useEffect, useState } from "react";
import { Option } from "@/lib/customer.constants";
import { getTagOptions, createTagOption } from "@/lib/tagOptions.service";
import { parseMultiValue } from "@/lib/utils";
import { TagCategory } from "@/types/tagOptions";

/**
 * Same "don't hide the value already on the record" behavior as
 * useMasterDataOptions, plus a createOption() for the Creatable Select
 * fields: it appends the option locally right away and persists it to
 * tag_options in the background, so it's available next time without a
 * refetch.
 */
export function useTagOptions(category: TagCategory, currentValue?: string | null) {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    getTagOptions(category).then((data) => {
      if (active) setOptions(data);
    });
    return () => {
      active = false;
    };
  }, [category]);

  const missing = parseMultiValue(currentValue).filter(
    (v) => !options.some((o) => o.value === v)
  );
  const allOptions =
    missing.length === 0 ? options : [...options, ...missing.map((v) => ({ value: v, label: v }))];

  function createOption(value: string): Option {
    const option: Option = { value, label: value };
    setOptions((prev) => (prev.some((o) => o.value === value) ? prev : [...prev, option]));
    createTagOption(category, value);
    return option;
  }

  return { options: allOptions, createOption };
}
