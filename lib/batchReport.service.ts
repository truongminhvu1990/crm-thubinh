import { supabase } from "./supabase";

export interface BatchRevenueRow {
  batchId: string;
  batchCode: string;
  revenue: number;
}

export interface BatchCountRow {
  batchId: string;
  batchCode: string;
  count: number;
}

export interface OverdueBatchRow {
  batchId: string;
  batchCode: string;
  dueDate: string;
  daysOverdue: number;
  remaining: number;
}

export interface BatchReportData {
  revenueByBatch: BatchRevenueRow[];
  productCountByBatch: BatchCountRow[];
  soldCountByBatch: BatchCountRow[];
  remainingCountByBatch: BatchCountRow[];
  overdueBatches: OverdueBatchRow[];
}

const EMPTY_REPORT: BatchReportData = {
  revenueByBatch: [],
  productCountByBatch: [],
  soldCountByBatch: [],
  remainingCountByBatch: [],
  overdueBatches: [],
};

interface BatchRow {
  id: string;
  batch_code: string;
  status: string | null;
  return_due_date: string | null;
}

interface ProductRow {
  id: string;
  batch_id: string | null;
  status: string | null;
}

interface PurchaseRow {
  sale_price: number;
  product: { batch_id: string | null } | null;
}

/**
 * Revenue/product count/sold count/remaining count are all computed live
 * from products and customer_purchases - no snapshot columns anywhere.
 * Overdue Batch is the one exception: it only needs product_batches'
 * own status/return_due_date, so it's derived straight from that table.
 */
export async function getBatchReportData(): Promise<BatchReportData> {
  const [batchesRes, productsRes, purchasesRes] = await Promise.all([
    supabase.from("product_batches").select("id, batch_code, status, return_due_date"),
    supabase.from("products").select("id, batch_id, status").not("batch_id", "is", null),
    supabase.from("customer_purchases").select("sale_price, product:products!inner(batch_id)"),
  ]);

  if (batchesRes.error || !batchesRes.data) {
    if (batchesRes.error) console.error("Error fetching batches for report:", batchesRes.error);
    return EMPTY_REPORT;
  }
  if (productsRes.error) console.error("Error fetching batch products for report:", productsRes.error);
  if (purchasesRes.error) console.error("Error fetching batch purchases for report:", purchasesRes.error);

  const batches = batchesRes.data as BatchRow[];
  const products = (productsRes.data || []) as ProductRow[];
  const purchases = (purchasesRes.data || []) as unknown as PurchaseRow[];

  const revenueMap = new Map<string, number>();
  for (const row of purchases) {
    const batchId = row.product?.batch_id;
    if (!batchId) continue;
    revenueMap.set(batchId, (revenueMap.get(batchId) || 0) + (Number(row.sale_price) || 0));
  }

  const productCountMap = new Map<string, number>();
  const soldCountMap = new Map<string, number>();
  const remainingCountMap = new Map<string, number>();
  for (const product of products) {
    if (!product.batch_id) continue;
    productCountMap.set(product.batch_id, (productCountMap.get(product.batch_id) || 0) + 1);
    if (product.status === "Sold") {
      soldCountMap.set(product.batch_id, (soldCountMap.get(product.batch_id) || 0) + 1);
    } else if (product.status !== "Returned") {
      remainingCountMap.set(product.batch_id, (remainingCountMap.get(product.batch_id) || 0) + 1);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  const toRows = (map: Map<string, number>) =>
    batches
      .map((b) => ({ batchId: b.id, batchCode: b.batch_code, count: map.get(b.id) || 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count);

  const revenueByBatch = batches
    .map((b) => ({ batchId: b.id, batchCode: b.batch_code, revenue: revenueMap.get(b.id) || 0 }))
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const productCountByBatch = toRows(productCountMap);
  const soldCountByBatch = toRows(soldCountMap);
  const remainingCountByBatch = toRows(remainingCountMap);

  const overdueBatches = batches
    .filter((b) => b.status === "active" && b.return_due_date && b.return_due_date < today)
    .map((b) => ({
      batchId: b.id,
      batchCode: b.batch_code,
      dueDate: b.return_due_date as string,
      daysOverdue: Math.floor(
        (new Date(today).getTime() - new Date(b.return_due_date as string).getTime()) / 86_400_000
      ),
      remaining: remainingCountMap.get(b.id) || 0,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { revenueByBatch, productCountByBatch, soldCountByBatch, remainingCountByBatch, overdueBatches };
}
