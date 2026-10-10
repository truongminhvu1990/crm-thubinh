// Dashboard biểu đồ - Wave B (F4 Top sản phẩm, F5 Top loại sản phẩm, F8 Nhóm giá). PURE aggregation: no I/O, no Supabase.
//
// The input is the RECOGNIZED purchase rows (BR-001 / BR-002, chosen by the caller with the canonical `isPurchaseRecognized`), one per
// customer_purchases row, dated by sale_date. Every ranking below is a different GROUPING of those same rows, so for the same range
//
//   Σ topProducts.rows.value + topProducts.others.value  ==  Σ categories.value  ==  Σ priceBands.value  ==  total
//
// and `total` is the KPI "Doanh thu đã ghi nhận" (Σ Number(sale_price) || 0 over the recognized rows - the exact per-row value the
// Dashboard card and the Wave A trend use). Nothing is dropped: a row with an unknown product, no category or no usable price is
// shown under its own label instead of disappearing. No cost / gross profit field exists anywhere in this module by design.

export const UNCATEGORIZED_LABEL = "Chưa phân loại";
export const UNKNOWN_PRODUCT_LABEL = "Sản phẩm không xác định";
export const TOP_PRODUCTS_LIMIT = 10;

/** Realized transaction-line price bands (Product Owner, locked): lower bound inclusive, upper bound exclusive. */
export type PriceBandKey = "under5m" | "5to10m" | "10to20m" | "20to50m" | "50to100m" | "from100m" | "noPrice";

export interface PriceBandDef {
  key: PriceBandKey;
  label: string;
  /** Inclusive lower bound (VND); null = none. */
  min: number | null;
  /** Exclusive upper bound (VND); null = none. */
  maxExclusive: number | null;
}

export const PRICE_BANDS: readonly PriceBandDef[] = [
  { key: "under5m", label: "Dưới 5 triệu", min: null, maxExclusive: 5_000_000 },
  { key: "5to10m", label: "5–10 triệu", min: 5_000_000, maxExclusive: 10_000_000 },
  { key: "10to20m", label: "10–20 triệu", min: 10_000_000, maxExclusive: 20_000_000 },
  { key: "20to50m", label: "20–50 triệu", min: 20_000_000, maxExclusive: 50_000_000 },
  { key: "50to100m", label: "50–100 triệu", min: 50_000_000, maxExclusive: 100_000_000 },
  { key: "from100m", label: "Từ 100 triệu", min: 100_000_000, maxExclusive: null },
];

export const NO_PRICE_BAND: PriceBandDef = { key: "noPrice", label: "Không có giá", min: null, maxExclusive: null };

/** The value a row contributes to every total: exactly what the recognized-revenue KPI adds up. */
export function lineValue(price: unknown): number {
  return Number(price) || 0;
}

/** A usable price is a finite number greater than zero. Missing, non-numeric, zero or negative prices cannot be placed in a band. */
export function isUsablePrice(price: unknown): boolean {
  if (price === null || price === undefined || price === "") return false;
  const n = Number(price);
  return Number.isFinite(n) && n > 0;
}

/** Exactly one band per row. 5,000,000 -> "5–10 triệu"; 100,000,000 -> "Từ 100 triệu". */
export function priceBandOf(price: unknown): PriceBandKey {
  if (!isUsablePrice(price)) return "noPrice";
  const n = Number(price);
  for (const b of PRICE_BANDS) {
    if (b.maxExclusive === null || n < b.maxExclusive) return b.key;
  }
  return "from100m";
}

/** A category is a real, non-blank products.category value; blank / null / whitespace means "Chưa phân loại". */
export function categoryOf(raw: string | null | undefined): string | null {
  return typeof raw === "string" && raw.trim() !== "" ? raw : null;
}

export interface CompositionLine {
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  /** products.category as stored (null when the product has none OR is not found). */
  category: string | null;
  /** false when product_id is null or the product row could not be found. */
  productFound: boolean;
  /** customer_purchases.sale_price as read. */
  price: unknown;
}

export interface RankedProduct {
  /** Stable identity of the group: the product id, or "unknown:<product_id>" / "unknown" for a missing product. */
  key: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  label: string;
  value: number;
  /** Recognized purchase lines in this group. */
  count: number;
  share: number;
}

export interface CategoryRow {
  /** The raw products.category, or null for "Chưa phân loại". Drill-downs filter on exactly this. */
  category: string | null;
  label: string;
  value: number;
  count: number;
  share: number;
}

export interface PriceBandRow {
  key: PriceBandKey;
  label: string;
  min: number | null;
  maxExclusive: number | null;
  value: number;
  count: number;
  share: number;
}

export interface OthersRow {
  /** Distinct products beyond the top N. */
  productCount: number;
  count: number;
  value: number;
  share: number;
}

export interface SalesComposition {
  /** = KPI "Doanh thu đã ghi nhận" for the same range. */
  total: number;
  /** Recognized purchase lines. */
  count: number;
  topProducts: { rows: RankedProduct[]; others: OthersRow; distinctProducts: number };
  categories: CategoryRow[];
  priceBands: PriceBandRow[];
}

const share = (value: number, total: number) => (total > 0 ? value / total : 0);

/** value desc, then more lines first, then label A-Z (Vietnamese collation), then key: the same input always ranks the same way. */
function byRank(a: { value: number; count: number; label: string; key: string }, b: { value: number; count: number; label: string; key: string }): number {
  if (a.value !== b.value) return b.value - a.value;
  if (a.count !== b.count) return b.count - a.count;
  const l = a.label.localeCompare(b.label, "vi");
  if (l !== 0) return l;
  return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

function productKey(line: CompositionLine): string {
  if (line.productFound && line.productId) return line.productId;
  return line.productId ? `unknown:${line.productId}` : "unknown";
}

function productLabel(line: CompositionLine): string {
  if (!line.productFound) return UNKNOWN_PRODUCT_LABEL;
  const code = line.productCode?.trim();
  const name = line.productName?.trim();
  if (code && name) return `${code} · ${name}`;
  return code || name || UNKNOWN_PRODUCT_LABEL;
}

export function buildComposition(lines: CompositionLine[], topN: number = TOP_PRODUCTS_LIMIT): SalesComposition {
  let total = 0;

  const products = new Map<string, RankedProduct>();
  const categories = new Map<string, CategoryRow>();
  const bands = new Map<PriceBandKey, PriceBandRow>();
  for (const def of [...PRICE_BANDS, NO_PRICE_BAND]) {
    bands.set(def.key, { key: def.key, label: def.label, min: def.min, maxExclusive: def.maxExclusive, value: 0, count: 0, share: 0 });
  }

  for (const line of lines) {
    const value = lineValue(line.price);
    total += value;

    const pKey = productKey(line);
    const p = products.get(pKey);
    if (p) {
      p.value += value;
      p.count += 1;
    } else {
      products.set(pKey, {
        key: pKey,
        productId: line.productFound ? line.productId : null,
        productCode: line.productFound ? line.productCode : null,
        productName: line.productFound ? line.productName : null,
        label: productLabel(line),
        value,
        count: 1,
        share: 0,
      });
    }

    const category = line.productFound ? categoryOf(line.category) : null;
    const cKey = category ?? "";
    const c = categories.get(cKey);
    if (c) {
      c.value += value;
      c.count += 1;
    } else {
      categories.set(cKey, { category, label: category ?? UNCATEGORIZED_LABEL, value, count: 1, share: 0 });
    }

    const band = bands.get(priceBandOf(line.price))!;
    band.value += value;
    band.count += 1;
  }

  const rankedProducts = [...products.values()].sort(byRank);
  const top = rankedProducts.slice(0, Math.max(0, topN));
  const rest = rankedProducts.slice(Math.max(0, topN));
  for (const r of top) r.share = share(r.value, total);
  const othersValue = rest.reduce((s, r) => s + r.value, 0);
  const others: OthersRow = {
    productCount: rest.length,
    count: rest.reduce((s, r) => s + r.count, 0),
    value: othersValue,
    share: share(othersValue, total),
  };

  const categoryRows = [...categories.values()]
    .map((c) => ({ ...c, share: share(c.value, total) }))
    .sort((a, b) => byRank({ ...a, key: a.category ?? "" }, { ...b, key: b.category ?? "" }));

  // The six real bands are always present (a stable axis, zero when empty); "Không có giá" appears only when such a row exists.
  const bandRows = [...PRICE_BANDS, NO_PRICE_BAND]
    .map((def) => bands.get(def.key)!)
    .filter((b) => b.key !== "noPrice" || b.count > 0)
    .map((b) => ({ ...b, share: share(b.value, total) }));

  return {
    total,
    count: lines.length,
    topProducts: { rows: top, others, distinctProducts: rankedProducts.length },
    categories: categoryRows,
    priceBands: bandRows,
  };
}
