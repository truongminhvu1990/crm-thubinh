"use client";

import { useEffect, useState } from "react";
import { Option } from "@/lib/customer.constants";
import { getBatches } from "@/lib/productBatch.service";

/** Batch options for the Product form's batch selector (value = batch id).
 * Batches are managed in the Product Batches module, not created here. */
export function useBatchOptions(): Option[] {
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    let active = true;
    getBatches().then((batches) => {
      if (!active) return;
      setOptions(
        batches.map((b) => ({
          value: b.id!,
          label: b.supplier ? `${b.batch_code} · ${b.supplier}` : b.batch_code,
        }))
      );
    });
    return () => {
      active = false;
    };
  }, []);

  return options;
}
