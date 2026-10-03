import { DETAIL_ENTITY_TYPES, DetailEntityType } from "@/types/reportDetail";

// Phase 1.6 (PO-approved URL state): `?detail=<type>:<uuid>`, e.g.
// `?detail=order:3f2c...`. Every other query param (metric / view / filters)
// is left untouched by whoever sets or clears it.

export const DETAIL_PARAM = "detail";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DetailTarget {
  type: DetailEntityType;
  id: string;
}

export function parseDetailParam(raw: string | null | undefined): DetailTarget | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep < 0) return null;
  const type = raw.slice(0, sep) as DetailEntityType;
  const id = raw.slice(sep + 1);
  if (!DETAIL_ENTITY_TYPES.includes(type) || !UUID.test(id)) return null;
  return { type, id: id.toLowerCase() };
}

export function formatDetailParam(target: DetailTarget): string {
  return `${target.type}:${target.id}`;
}

/** Search string (no leading "?") with `detail` set, or removed when `target` is null. */
export function withDetailParam(search: string, target: DetailTarget | null): string {
  const p = new URLSearchParams(search);
  if (target) p.set(DETAIL_PARAM, formatDetailParam(target));
  else p.delete(DETAIL_PARAM);
  return p.toString();
}

/** Official management page for the "Xem đầy đủ" CTA. Inventory has no
 * per-product route (its list page hosts its own drawer), so it goes to the list. */
export function fullPageHref(target: DetailTarget): string {
  switch (target.type) {
    case "order":
      return `/orders/${target.id}`;
    case "product":
      return `/products/${target.id}`;
    case "customer":
      return `/customers/${target.id}`;
    case "inventory":
      return "/inventory";
  }
}
