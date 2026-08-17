"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mergeColumnPreferenceForSave, resolveEffectiveVisibleColumns } from "@/lib/reportPreferences/reportPreferences.service";

const STORAGE_KEY_PREFIX = "crm.moneyDebtLedger.columns";

export interface UseMoneyDebtLedgerColumnPreference<K extends string> {
  visibleColumns: Set<K>;
  setVisibleColumns: (next: Set<K>) => void;
  resetToDefault: () => void;
  isLoading: boolean;
}

function readStorage<K extends string>(key: string): K[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Corrupt/unexpected shape (§Phase 3: "localStorage bị lỗi/corrupt") ->
    // fall back to default (null), never throw into the render path.
    if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) return null;
    return parsed as K[];
  } catch {
    return null;
  }
}

function writeStorage<K extends string>(key: string, value: K[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable/full/blocked (private browsing, quota) — the
    // in-memory selection still works for this session, it just won't
    // survive a reload. Same "never break the UI over a failed save"
    // posture as the DB-backed report-preferences hook.
  }
}

/** Money & Debt Ledger's own column-visibility persistence — localStorage,
 * not the DB-backed report-preferences infrastructure (lib/hooks/
 * useReportColumnPreference.ts): this page isn't part of the Reports
 * module, and a same-browser preference has no need for a server round
 * trip or a new `report_key`. Reuses that module's two PURE merge/resolve
 * functions (no I/O, storage-agnostic) rather than reimplementing the same
 * "stored ∩ available, preserve what's temporarily unavailable" logic.
 *
 * Key is namespaced per the current Supabase auth user id when available
 * (resolved client-side via supabase.auth.getUser(), the same client
 * already used elsewhere in this app) so two different staff sharing a
 * browser profile don't clobber each other's column choice; falls back to
 * a shared "anonymous" bucket only until that resolves or if it's
 * unavailable. Never stores anything beyond a plain string array of column
 * keys — no secret, no session token, no PII. */
export function useMoneyDebtLedgerColumnPreference<K extends string>(availableKeys: K[]): UseMoneyDebtLedgerColumnPreference<K> {
  const [storageKey, setStorageKey] = useState<string>(`${STORAGE_KEY_PREFIX}.anonymous`);
  const [rawStored, setRawStored] = useState<K[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (cancelled) return;
        const key = `${STORAGE_KEY_PREFIX}.${data.user?.id ?? "anonymous"}`;
        setStorageKey(key);
        setRawStored(readStorage<K>(key));
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Can't resolve a user id — still usable, just under the shared
        // anonymous bucket already set as the initial state above.
        setRawStored(readStorage<K>(`${STORAGE_KEY_PREFIX}.anonymous`));
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setVisibleColumns(next: Set<K>) {
    const newRaw = mergeColumnPreferenceForSave(rawStored, availableKeys, next);
    setRawStored(newRaw);
    writeStorage(storageKey, newRaw);
  }

  function resetToDefault() {
    setRawStored(null);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Same non-fatal posture as writeStorage above.
    }
  }

  return {
    visibleColumns: resolveEffectiveVisibleColumns(rawStored, availableKeys),
    setVisibleColumns,
    resetToDefault,
    isLoading,
  };
}
