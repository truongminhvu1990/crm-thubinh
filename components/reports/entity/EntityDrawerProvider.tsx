"use client";

import { createContext, ReactNode, useCallback, useContext, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DetailTarget, parseDetailParam, DETAIL_PARAM, withDetailParam } from "@/lib/reports/entityDetailParam";
import EntityDrawer from "./EntityDrawer";

interface EntityDrawerContextValue {
  open: (target: DetailTarget) => void;
}

const EntityDrawerContext = createContext<EntityDrawerContextValue | null>(null);

/** null outside a provider - EntityLink then degrades to plain text. */
export function useEntityDrawerContext() {
  return useContext(EntityDrawerContext);
}

/** Phase 1.6: the drawer's open/closed state IS the URL (`?detail=type:uuid`),
 * so F5, Back/Forward and deep links all work, and the report's own params
 * (metric / view / filters) are preserved because only `detail` is touched.
 * Opening pushes a history entry (Back/Forward walk between entities). Closing
 * REPLACES the current entry (native replaceState) with the same URL minus `detail`, so the user lands
 * on the report context exactly as it was and the close can never overshoot
 * history (e.g. after a Back press or from a deep link). */
export default function EntityDrawerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const target = parseDetailParam(search.get(DETAIL_PARAM));
  const searchString = search.toString();

  const open = useCallback(
    (next: DetailTarget) => {
      router.push(`${pathname}?${withDetailParam(searchString, next)}`, { scroll: false });
    },
    [pathname, router, searchString]
  );

  // Closing uses the documented native-History integration (Next syncs usePathname/useSearchParams from it):
  // on the PRODUCTION build router.replace(pathname) from "?detail=..." to a URL with no query at all was a silent
  // no-op (found in closure UAT: Monthly Sold Products, Payment Method), while the same call with other params worked.
  const close = useCallback(() => {
    const qs = withDetailParam(searchString, null);
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [pathname, searchString]);

  const value = useMemo(() => ({ open }), [open]);

  return (
    <EntityDrawerContext.Provider value={value}>
      {children}
      <EntityDrawer target={target} onClose={close} />
    </EntityDrawerContext.Provider>
  );
}
