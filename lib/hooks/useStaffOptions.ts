"use client";

import { useEffect, useState } from "react";
import { Option } from "@/lib/customer.constants";
import { getStaffList } from "@/lib/staff.service";

/** Active staff options for the "Assigned Staff" selector (Feature 4),
 * value = staff id. Same shape as useBatchOptions()'s batch selector. */
export function useStaffOptions(): Option[] {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    getStaffList().then((staffList) => {
      if (!active) return;
      setOptions(
        staffList
          .filter((s) => s.status === "Active")
          .map((s) => ({ value: s.id, label: `${s.staff_code} · ${s.full_name}` }))
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
}
