"use client";

import { useEffect, useState } from "react";
import { ReportKey } from "@/types/reportPreferences";
import { mergeColumnPreferenceForSave, resolveEffectiveVisibleColumns } from "@/lib/reportPreferences/reportPreferences.service";

export interface UseReportColumnPreference<K extends string> {
  /** stored preference (intersected with `availableKeys`) if one exists,
   * otherwise every currently-available column — §15's default. */
  visibleColumns: Set<K>;
  /** Same signature ColumnPicker's own onChange already expects — a report
   * page can pass this straight through with no adapter. */
  setVisibleColumns: (next: Set<K>) => void;
  isLoading: boolean;
  /** True only while the most recent save attempt is known to have failed.
   * The local selection above is never rolled back because of this — a
   * failed save degrades to "this session's choice won't survive reload,"
   * never to a broken or reverted UI (Product Owner instruction, §16). */
  saveError: boolean;
}

/** Generic, report-agnostic column-visibility persistence — reused by every
 * report's own page (Sales Ledger, Monthly Sold Products, ...), each with
 * its own `reportKey` and column-key type. Deliberately NOT part of
 * components/reports/ColumnPicker.tsx (Architecture Safety instruction):
 * ColumnPicker stays pure presentation with no persistence/report-specific
 * knowledge; this hook is the thing report pages compose it with. */
export function useReportColumnPreference<K extends string>(
  reportKey: ReportKey,
  availableKeys: K[]
): UseReportColumnPreference<K> {
  const [rawStored, setRawStored] = useState<K[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setIsLoading(true);
    });
    fetch(`/api/report-preferences?reportKey=${reportKey}`)
      .then((res) => (res.ok ? res.json() : { preference: null }))
      .then((data: { preference: { visibleColumns: K[] } | null }) => {
        if (cancelled) return;
        setRawStored(data.preference?.visibleColumns ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // No saved preference reachable -> current behavior (all available
        // columns visible), same as a genuinely first-time user; never
        // blocks the report itself from loading.
        setRawStored(null);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportKey]);

  function setVisibleColumns(next: Set<K>) {
    const newRaw = mergeColumnPreferenceForSave(rawStored, availableKeys, next);
    setRawStored(newRaw); // optimistic — the picker/table reflect the choice immediately regardless of save outcome
    setSaveError(false);

    fetch("/api/report-preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportKey, visibleColumns: newRaw }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      })
      .catch((err) => {
        console.error("Failed to save report column preference:", err);
        setSaveError(true);
      });
  }

  return {
    visibleColumns: resolveEffectiveVisibleColumns(rawStored, availableKeys),
    setVisibleColumns,
    isLoading,
    saveError,
  };
}
