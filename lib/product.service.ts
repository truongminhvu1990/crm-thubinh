import { supabase } from "./supabase";
import { Product } from "@/types/product";
import { Customer } from "@/types/customer";
import { parseMultiValue } from "./utils";

/** Extracts a [min, max] VND range from a free-text budget string like
 * "10-20 triệu" or "dưới 5tr". Returns null if no number can be parsed -
 * callers should skip budget filtering rather than guess. */
function parseBudgetRangeVND(budget?: string | null): [number, number] | null {
  if (!budget) return null;
  const numbers = budget.match(/[\d.,]+/g)?.map((s) => parseFloat(s.replace(/,/g, "")));
  if (!numbers || numbers.length === 0) return null;

  const isMillion = /tr(i[ệe]u)?/i.test(budget);
  const isThousand = /ngh[ìi]n|\bk\b/i.test(budget);
  const multiplier = isMillion ? 1_000_000 : isThousand ? 1_000 : 1;
  const scaled = numbers.map((n) => n * multiplier);

  if (scaled.length === 1) return [0, scaled[0]];
  return [Math.min(...scaled), Math.max(...scaled)];
}

export interface MatchedProduct {
  product: Product;
  matchedOn: ("category" | "color" | "wrist_size" | "ring_size" | "budget" | "purchase_history")[];
  /** Recommendation Score (AI_JADE_SPEC.md §2.4) - 5 equal-weighted signals
   * (Type/Color/Size/Budget/Purchase History), 20 points each, 0-100. Size
   * folds wrist_size+ring_size into one signal so it can't double-count. */
  score: number;
}

export interface PurchaseHistorySummary {
  totalPurchases: number;
  favoriteCategory: string | null;
  favoriteColor: string | null;
}

const EMPTY_PURCHASE_HISTORY: PurchaseHistorySummary = {
  totalPurchases: 0,
  favoriteCategory: null,
  favoriteColor: null,
};

function mostFrequent(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Jade Intelligence's own read of customer_purchases (AI_JADE_SPEC.md §3) -
 * a separate, isolated query rather than reusing purchase.service.ts's
 * getPurchasesByCustomer(), since that function's WITH_PRODUCT select is
 * shared with the Customer module's own CRUD paths and doesn't join
 * category/color.
 */
export async function getPurchaseHistorySummary(customerId?: string): Promise<PurchaseHistorySummary> {
  if (!customerId) return EMPTY_PURCHASE_HISTORY;

  const { data, error } = await supabase
    .from("customer_purchases")
    .select("product:products(category, color)")
    .eq("customer_id", customerId);

  if (error || !data) {
    if (error) console.error("Error fetching purchase history summary:", error);
    return EMPTY_PURCHASE_HISTORY;
  }

  const rows = data as unknown as { product: { category: string | null; color: string | null } | null }[];
  return {
    totalPurchases: rows.length,
    favoriteCategory: mostFrequent(rows.map((r) => r.product?.category)),
    favoriteColor: mostFrequent(rows.map((r) => r.product?.color)),
  };
}

/**
 * Real, rule-based matching against the customer's actual wishlist fields
 * and purchase history - no fabricated recommendations. Returns [] if the
 * customer has no wishlist data and no purchase history (nothing honest to
 * match against) rather than showing arbitrary products.
 */
// The `ring_size` column on `customers` is a dormant, pre-existing column
// that was never type-normalized to text (unlike wrist_size/favorite_type/
// favorite_color/budget), so PostgREST can hand back a number instead of a
// string here. Coerce defensively rather than assume the declared type.
function toTrimmedString(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

export async function getMatchingProducts(
  customer: Customer,
  limit = 6,
  purchaseHistory?: PurchaseHistorySummary
): Promise<MatchedProduct[]> {
  const types = parseMultiValue(customer.favorite_type);
  const colors = parseMultiValue(customer.favorite_color);
  const wristSize = toTrimmedString(customer.wrist_size);
  const ringSize = toTrimmedString(customer.ring_size);
  const budgetRange = parseBudgetRangeVND(customer.budget);
  const { favoriteCategory, favoriteColor } = purchaseHistory ?? (await getPurchaseHistorySummary(customer.id));

  if (
    types.length === 0 &&
    colors.length === 0 &&
    !wristSize &&
    !ringSize &&
    !budgetRange &&
    !favoriteCategory &&
    !favoriteColor
  ) {
    return [];
  }

  function buildQuery(select: string) {
    let q = supabase.from("products").select(select).eq("status", "Active");

    const categoryOr = new Set(types);
    if (favoriteCategory) categoryOr.add(favoriteCategory);
    const colorOr = new Set(colors);
    if (favoriteColor) colorOr.add(favoriteColor);

    const orClauses: string[] = [];
    if (categoryOr.size > 0) orClauses.push(`category.in.(${Array.from(categoryOr).join(",")})`);
    if (colorOr.size > 0) orClauses.push(`color.in.(${Array.from(colorOr).join(",")})`);

    if (orClauses.length > 0) {
      q = q.or(orClauses.join(","));
    } else {
      // No category/color preference - fall back to budget/wrist-size-only matching.
      q = q.limit(50);
    }

    return q;
  }

  // Same join-fallback reasoning as getProducts(): don't let a missing
  // product_images table break matching entirely.
  let { data, error } = await buildQuery("*, images:product_images(id, image_url, sort_order)");
  if (error) {
    ({ data, error } = await buildQuery("*"));
  }

  if (error || !data) {
    console.error("Error fetching matching products:", error);
    return [];
  }

  const scored: MatchedProduct[] = (data as unknown as Product[]).map((product) => {
    const matchedOn: MatchedProduct["matchedOn"] = [];
    const typeMatch = !!product.category && types.includes(product.category);
    const colorMatch = !!product.color && colors.includes(product.color);
    const wristMatch = !!wristSize && toTrimmedString(product.wrist_size) === wristSize;
    const ringMatch = !!ringSize && toTrimmedString(product.ring_size) === ringSize;
    const budgetMatch =
      !!budgetRange &&
      typeof product.sale_price === "number" &&
      product.sale_price >= budgetRange[0] &&
      product.sale_price <= budgetRange[1];
    const purchaseHistoryMatch =
      (!!favoriteCategory && product.category === favoriteCategory) ||
      (!!favoriteColor && product.color === favoriteColor);

    if (typeMatch) matchedOn.push("category");
    if (colorMatch) matchedOn.push("color");
    if (wristMatch) matchedOn.push("wrist_size");
    if (ringMatch) matchedOn.push("ring_size");
    if (budgetMatch) matchedOn.push("budget");
    if (purchaseHistoryMatch) matchedOn.push("purchase_history");

    const signals = [typeMatch, colorMatch, wristMatch || ringMatch, budgetMatch, purchaseHistoryMatch];
    const score = signals.filter(Boolean).length * 20;

    return { product, matchedOn, score };
  });

  return scored
    .filter((m) => m.matchedOn.length > 0)
    .sort((a, b) => b.score - a.score || a.product.product_name.localeCompare(b.product.product_name))
    .slice(0, limit);
}

const WRITABLE_FIELDS: (keyof Product)[] = [
  "sku",
  "product_code",
  "category",
  "product_name",
  "status",
  "jade_grade",
  "color",
  "size",
  "weight",
  "notes",
  "cost_price",
  "sale_price",
  "discount",
  "location",
  "certificate_no",
  "supplier",
  "source",
  "salesperson",
  "video",
  "batch_id",
  // available/reserved/sold are read-only in the app today - display only,
  // sourced from the current database values until the Orders module
  // becomes their sole writer. Not included here on purpose.
];

function pickWritableFields(
  product: Partial<Product>,
  { skipEmpty = false }: { skipEmpty?: boolean } = {}
): Partial<Product> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = product[field];
    if (value === undefined) return;
    if (skipEmpty && value === "") return;
    filteredData[field] = value;
  });
  return filteredData as Partial<Product>;
}

function buildProductsQuery(
  select: string,
  searchTerm?: string,
  category?: string,
  status?: string
) {
  let query = supabase.from("products").select(select);

  if (searchTerm) {
    query = query.or(
      `product_name.ilike.%${searchTerm}%,product_code.ilike.%${searchTerm}%,sku.ilike.%${searchTerm}%`
    );
  }

  if (category) {
    query = query.eq("category", category);
  }

  if (status) {
    query = query.eq("status", status);
  }

  return query.order("created_at", { ascending: false });
}

export async function getProducts(
  searchTerm?: string,
  category?: string,
  status?: string
): Promise<Product[]> {
  // The batch/images joins depend on migrations that may not have run yet
  // (product_batches, product_images) - PostgREST errors the whole query
  // if either relationship can't be resolved, so fall back to a join-less
  // fetch on error rather than breaking the product list entirely.
  let { data, error } = await buildProductsQuery(
    "*, batch:product_batches(batch_code), images:product_images(id, image_url, sort_order)",
    searchTerm,
    category,
    status
  );

  if (error) {
    ({ data, error } = await buildProductsQuery("*", searchTerm, category, status));
  }

  if (error) {
    console.error("Error fetching products:", error);
    return [];
  }

  return data as unknown as Product[];
}

export async function getProductById(id: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching product:", error);
    return null;
  }

  return data as Product;
}

/** Product Code is the primary duplicate key (business rule). Exact match
 * only - no fuzzy matching. `excludeId` leaves out the record being edited
 * so a product's own code never flags itself as a duplicate. */
export async function findProductByCode(
  productCode: string,
  excludeId?: string
): Promise<Product | null> {
  let query = supabase.from("products").select("*").eq("product_code", productCode);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    console.error("Error checking for duplicate product code:", error);
    return null;
  }

  return data as Product | null;
}

/** SKU duplicate check - same pattern as findProductByCode. SKU is optional,
 * so a blank SKU is never checked (two blank SKUs are not a conflict). */
export async function findProductBySku(
  sku: string,
  excludeId?: string
): Promise<Product | null> {
  if (!sku) return null;

  let query = supabase.from("products").select("*").eq("sku", sku);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    console.error("Error checking for duplicate SKU:", error);
    return null;
  }

  return data as Product | null;
}

export async function addProduct(product: Partial<Product>) {
  const filteredData = pickWritableFields(product, { skipEmpty: true });

  const { data, error } = await supabase
    .from("products")
    .insert(filteredData)
    .select()
    .single();

  if (error) {
    console.error("Error adding product:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateProduct(id: string, product: Partial<Product>) {
  const filteredData = pickWritableFields(product);

  const { data, error } = await supabase
    .from("products")
    .update(filteredData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating product:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function deleteProduct(id: string) {
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    console.error("Error deleting product:", error);
  }

  return error;
}

/** Batched duplicate check for Quick Import - one query for every product
 * code in the file, instead of one round trip per row. */
export async function findExistingProductCodes(codes: string[]): Promise<Set<string>> {
  if (codes.length === 0) return new Set();

  const { data, error } = await supabase.from("products").select("product_code").in("product_code", codes);

  if (error || !data) {
    if (error) console.error("Error checking existing product codes:", error);
    return new Set();
  }

  return new Set((data as { product_code: string }[]).map((r) => r.product_code));
}

/** Quick Import bulk insert - one INSERT for every row that already passed
 * row validation and duplicate checks, reusing the same writable-field
 * filter as addProduct so imported rows can never write a non-writable
 * column (available/reserved/sold, batch_id, etc.). */
export async function bulkAddProducts(products: Partial<Product>[]) {
  if (products.length === 0) return { data: [], error: null };

  const rows = products.map((p) => pickWritableFields(p, { skipEmpty: true }));

  const { data, error } = await supabase.from("products").insert(rows).select();

  if (error) {
    console.error("Error bulk adding products:", error);
    return { data: null, error };
  }

  return { data, error: null };
}
