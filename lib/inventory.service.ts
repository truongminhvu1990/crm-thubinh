import { Product } from "@/types/product";
import { ProductBatch } from "@/types/productBatch";
import { OrderStatus } from "@/types/order";
import { supabase } from "@/lib/supabase";
import { PRODUCT_STATUS, labelFor } from "./product.constants";

const UNSPECIFIED = "Chưa xác định";
const NO_BATCH = "Chưa gán lô";

const OPEN_ORDER_STATUSES: OrderStatus[] = ["Draft", "Reserved"];

export interface CountBreakdown {
  label: string;
  count: number;
}

export interface InventoryStats {
  total: number;
  byStatus: CountBreakdown[];
  byOrigin: CountBreakdown[];
  byCategory: CountBreakdown[];
  byBatch: CountBreakdown[];
  bySalesOwner: CountBreakdown[];
}

function countBy(products: Product[], keyFn: (p: Product) => string): CountBreakdown[] {
  const map = new Map<string, number>();
  for (const product of products) {
    const key = keyFn(product);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Counts only - every breakdown is COUNT(*) GROUP BY the given field
 * (Spec §8 / UI §1.4). Never reads products.available/reserved/sold.
 */
export function computeInventoryStats(
  products: Product[],
  batches: ProductBatch[]
): InventoryStats {
  const batchCodeById = new Map(batches.map((b) => [b.id, b.batch_code]));

  return {
    total: products.length,
    byStatus: countBy(products, (p) => labelFor(PRODUCT_STATUS, p.status) || p.status || UNSPECIFIED),
    byOrigin: countBy(products, (p) => p.origin || UNSPECIFIED),
    byCategory: countBy(products, (p) => p.category || UNSPECIFIED),
    byBatch: countBy(products, (p) =>
      p.batch_id ? batchCodeById.get(p.batch_id) || UNSPECIFIED : NO_BATCH
    ),
    bySalesOwner: countBy(products, (p) => p.salesperson || UNSPECIFIED),
  };
}

// ---------------------------------------------------------------------------
// Product Availability / Reservation Status / Lost tracking (P5 Product
// Owner Decision). Read-only: derived by joining Product.status with the
// existing, already-live Orders module (order_items -> orders) via a fresh
// query owned by Inventory - never a write, never a change to
// lib/orders/* (that module stays LOCKED/untouched), never a new column.
// ---------------------------------------------------------------------------

export interface ProductOrderLink {
  order_id: string;
  order_number: string;
  order_status: OrderStatus;
  lost_reason?: string | null;
}

type ProductOrderLinkRow = {
  product_id: string;
  order: { id: string; order_number: string; order_status: OrderStatus; lost_reason: string | null } | null;
};

/** One Supabase round trip for every currently-loaded product, grouped by
 * product_id. Products with no order_items at all simply have no entry. */
export async function getProductOrderLinks(
  productIds: string[]
): Promise<Record<string, ProductOrderLink[]>> {
  if (productIds.length === 0) return {};

  const { data, error } = await supabase
    .from("order_items")
    .select("product_id, order:orders(id, order_number, order_status, lost_reason)")
    .in("product_id", productIds);

  if (error) {
    console.error("Error fetching product order links:", error);
    return {};
  }

  const map: Record<string, ProductOrderLink[]> = {};
  for (const row of (data as unknown as ProductOrderLinkRow[]) || []) {
    if (!row.order) continue;
    const list = map[row.product_id] || (map[row.product_id] = []);
    list.push({
      order_id: row.order.id,
      order_number: row.order.order_number,
      order_status: row.order.order_status,
      lost_reason: row.order.lost_reason,
    });
  }
  return map;
}

export type Availability = "available" | "reserved" | "unavailable";

/** "Reserved" wins whenever an open (Draft/Reserved) order references the
 * product - that overrides whatever products.status currently says, since
 * Orders never writes back to Product (see docs/ORDERS_EXECUTION_READINESS.md
 * Blocker B) and this is exactly the gap Availability exists to surface.
 * Otherwise falls back to products.status: Active = available, anything
 * else (Paused/Sold/Discontinued/Returned) = unavailable. */
export function deriveAvailability(product: Product, links: ProductOrderLink[]): Availability {
  if (links.some((l) => OPEN_ORDER_STATUSES.includes(l.order_status))) return "reserved";
  return product.status === "Active" ? "available" : "unavailable";
}

export interface VerificationFlag {
  reason: string;
}

/** Judgment call (disclosed, not spec-locked): flags cases where
 * products.status and the product's Orders history disagree, since that is
 * exactly the same "counter can't be trusted blindly" problem
 * docs/INVENTORY_SPEC.md was written to solve, extended from
 * available/reserved/sold to status-vs-Orders. Informational only - Phase 1
 * stays read-only, nothing here corrects the data. */
export function verifyProduct(product: Product, links: ProductOrderLink[]): VerificationFlag[] {
  const flags: VerificationFlag[] = [];
  const hasCompleted = links.some((l) => l.order_status === "Completed");
  const hasOpenOrder = links.some((l) => OPEN_ORDER_STATUSES.includes(l.order_status));

  if (hasCompleted && product.status !== "Sold") {
    flags.push({
      reason: `Có đơn hàng đã hoàn tất nhưng trạng thái sản phẩm chưa phải "Đã bán".`,
    });
  }
  if (hasOpenOrder && product.status !== "Active" && product.status !== "Paused") {
    flags.push({
      reason: `Đang có đơn hàng mở nhưng trạng thái sản phẩm là "${
        labelFor(PRODUCT_STATUS, product.status) || product.status || UNSPECIFIED
      }".`,
    });
  }
  return flags;
}
