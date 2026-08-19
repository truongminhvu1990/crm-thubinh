import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { ConsignmentOverviewRow } from "@/types/consignmentOverview";

/** Consignment Overview Read Model — answers the 12 operational questions
 * a Product Owner needs without opening multiple records, entirely from
 * already-existing data (see this feature's own audit: EXISTS/PARTIAL
 * classification per field). Reads `consignments`,
 * `consignment_financial_records`, `orders`, `customers`,
 * `consignment_settlement_items`, and `consignment_settlements` directly —
 * a Read Model, never calling another module's service functions, the
 * same discipline every other Consignment Read Model already follows.
 * Owns no data of its own; every figure is traced back to its owning
 * table in the type's own doc comments (types/consignmentOverview.ts). */

const CONSIGNMENT_ROWS_QUERY = "*, customer:customers(id, full_name), product:products(id, product_name, product_code)";
const FINANCIAL_RECORD_ROWS_QUERY =
  "id, consignment_id, sale_price, fee, customer_payable, created_at, order:orders(id, order_number, sales_owner, customer_id, customer:customers(id, full_name))";

interface RawConsignment {
  id: string;
  consignment_code: string;
  status: string;
  created_at: string;
  returned_at: string | null;
  customer: { id: string; full_name: string } | { id: string; full_name: string }[] | null;
  product: { id: string; product_name: string; product_code: string } | { id: string; product_name: string; product_code: string }[] | null;
}

interface RawFinancialRecord {
  id: string;
  consignment_id: string;
  sale_price: number;
  fee: number;
  customer_payable: number;
  created_at: string;
  order:
    | { id: string; order_number: string; sales_owner: string; customer_id: string; customer: { id: string; full_name: string } | { id: string; full_name: string }[] | null }
    | { id: string; order_number: string; sales_owner: string; customer_id: string; customer: { id: string; full_name: string } | { id: string; full_name: string }[] | null }[]
    | null;
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

export interface ConsignmentOverviewFilters {
  status?: string;
  searchTerm?: string;
  consignmentId?: string;
}

export async function getConsignmentOverview(
  filters: ConsignmentOverviewFilters = {},
  client: SupabaseClient = supabase
): Promise<ConsignmentOverviewRow[]> {
  let consignmentQuery = client.from("consignments").select(CONSIGNMENT_ROWS_QUERY);
  if (filters.status) consignmentQuery = consignmentQuery.eq("status", filters.status);
  if (filters.consignmentId) consignmentQuery = consignmentQuery.eq("id", filters.consignmentId);

  const { data: consignmentRows, error: consignmentError } = await consignmentQuery.order("created_at", { ascending: false });
  if (consignmentError) {
    console.error("Error fetching consignment overview (consignments):", consignmentError);
    return [];
  }

  const { data: financialRows, error: financialError } = await client
    .from("consignment_financial_records")
    .select(FINANCIAL_RECORD_ROWS_QUERY);
  if (financialError) {
    console.error("Error fetching consignment overview (financial records):", financialError);
    return [];
  }

  const { data: settlementItemRows, error: settlementError } = await client
    .from("consignment_settlement_items")
    .select("consignment_financial_record_id, consignment_settlement:consignment_settlements(status)");
  if (settlementError) {
    console.error("Error fetching consignment overview (settlement items):", settlementError);
    return [];
  }

  const completedRecordIds = new Set(
    ((settlementItemRows ?? []) as { consignment_financial_record_id: string; consignment_settlement: { status: string } | { status: string }[] | null }[])
      .filter((item) => one(item.consignment_settlement)?.status === "Completed")
      .map((item) => item.consignment_financial_record_id)
  );

  const financialByConsignmentId = new Map<string, RawFinancialRecord>();
  for (const row of (financialRows ?? []) as RawFinancialRecord[]) {
    financialByConsignmentId.set(row.consignment_id, row);
  }

  const now = new Date().toISOString();

  let rows: ConsignmentOverviewRow[] = ((consignmentRows ?? []) as RawConsignment[]).map((c) => {
    const customer = one(c.customer);
    const product = one(c.product);
    const record = financialByConsignmentId.get(c.id) ?? null;
    const order = record ? one(record.order) : null;
    const buyer = order ? one(order.customer) : null;

    const holdingEndAt = c.status === "SOLD" && record ? record.created_at : c.status === "RETURNED" && c.returned_at ? c.returned_at : now;

    const customerPaid = record ? (completedRecordIds.has(record.id) ? record.customer_payable : 0) : null;
    const customerOutstanding = record !== null && customerPaid !== null ? record.customer_payable - customerPaid : null;

    return {
      consignmentId: c.id,
      consignmentCode: c.consignment_code,
      status: c.status as ConsignmentOverviewRow["status"],
      productId: product?.id ?? "",
      productCode: product?.product_code ?? "",
      productName: product?.product_name ?? "",
      consignorId: customer?.id ?? "",
      consignorName: customer?.full_name ?? "",
      receivedAt: c.created_at,
      returnedAt: c.returned_at,
      holdingDays: daysBetween(c.created_at, holdingEndAt),
      orderId: order?.id ?? null,
      orderNumber: order?.order_number ?? null,
      buyerId: buyer?.id ?? null,
      buyerName: buyer?.full_name ?? null,
      salesperson: order?.sales_owner ?? null,
      saleDate: record?.created_at ?? null,
      salePrice: record?.sale_price ?? null,
      fee: record?.fee ?? null,
      customerPayable: record?.customer_payable ?? null,
      customerPaid,
      customerOutstanding,
    };
  });

  if (filters.searchTerm) {
    const term = filters.searchTerm.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.consignmentCode.toLowerCase().includes(term) ||
        r.consignorName.toLowerCase().includes(term) ||
        r.productName.toLowerCase().includes(term) ||
        r.productCode.toLowerCase().includes(term) ||
        (r.buyerName ?? "").toLowerCase().includes(term)
    );
  }

  return rows;
}
