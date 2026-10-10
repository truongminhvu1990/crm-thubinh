import { SupabaseClient } from "@supabase/supabase-js";
import { DateRange } from "@/lib/dateFilter";
import { Staff } from "@/types/staff";
import { fetchPurchaseRows } from "@/lib/reports/reports.service";
import { isPurchaseRecognized } from "@/lib/reports/revenueDefinition";
import { buildComposition, CompositionLine, SalesComposition, TOP_PRODUCTS_LIMIT } from "./composition";

// Dashboard biểu đồ - Wave B (F4 / F5 / F8). ONE read of the canonical recognized-revenue rows feeds all three rankings, so they cannot
// disagree with each other or with the KPI:
//
//   fetchPurchaseRows (the query behind "Doanh thu đã ghi nhận", same Data Scope, paged past the 1000-row cap)
//     -> isPurchaseRecognized (BR-001 / BR-002, the canonical predicate)  -> grouped by buildComposition (pure)
//
// The only extra read is products.category by product id (the purchase row does not carry it). Cost is never read, selected or returned.

export type RecognizedPurchaseRow = NonNullable<Awaited<ReturnType<typeof fetchPurchaseRows>>["data"]>[number];

export interface SalesCompositionResponse extends SalesComposition {
  range: DateRange | null;
  /** Always sale_date: recognized revenue is dated by customer_purchases.sale_date (BR-001 / BR-002). */
  dateBasis: "sale_date";
}

/** A read that failed must be an error, never an empty / "Chưa phân loại" chart. */
export class CompositionReadError extends Error {
  constructor() {
    super("Không đọc được dữ liệu");
    this.name = "CompositionReadError";
  }
}

const ID_CHUNK = 200;

/** products.category for every distinct product id of the rows. A product that is not found is simply absent from the map (the pure
 * layer then labels it "Sản phẩm không xác định"); a failed read throws instead of silently turning categories into "Chưa phân loại". */
export async function loadCategoryByProductId(
  client: SupabaseClient,
  rows: { product_id: string | null }[]
): Promise<Map<string, string | null>> {
  const ids = Array.from(new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id)));
  const found = new Map<string, string | null>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await client.from("products").select("id, category").in("id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new CompositionReadError();
    for (const p of (data ?? []) as { id: string; category: string | null }[]) found.set(p.id, p.category ?? null);
  }
  return found;
}

/** Pure: recognized purchase rows + the category lookup -> the lines the aggregation consumes. */
export function toCompositionLines(rows: RecognizedPurchaseRow[], categoryById: Map<string, string | null>): CompositionLine[] {
  return rows.map((row) => {
    const productFound = !!row.product_id && categoryById.has(row.product_id);
    return {
      productId: row.product_id,
      productCode: row.product?.product_code ?? null,
      productName: row.product?.product_name ?? null,
      category: productFound && row.product_id ? categoryById.get(row.product_id) ?? null : null,
      productFound,
      price: row.sale_price,
    };
  });
}

export async function getSalesComposition(
  range: DateRange | null,
  client: SupabaseClient,
  staff: Staff | null,
  topN: number = TOP_PRODUCTS_LIMIT
): Promise<SalesCompositionResponse> {
  const { data, error } = await fetchPurchaseRows(range, client, staff);
  if (error || !data) throw new CompositionReadError();

  const recognized = data.filter((row) => isPurchaseRecognized(row));
  const categoryById = await loadCategoryByProductId(client, recognized);
  const composition = buildComposition(toCompositionLines(recognized, categoryById), topN);
  return { range, dateBasis: "sale_date", ...composition };
}
