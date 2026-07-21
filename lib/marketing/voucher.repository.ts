import { supabase } from "@/lib/supabase";
import { MARKETING_PAGE_SIZE } from "./marketing.constants";
import { MarketingVoucher, VoucherFilters, VoucherPage } from "@/types/marketingAutomation";

// Raw Supabase access only - Package 8, Voucher Foundation (no redemption
// flow, Spec Rev.2 decision #11).

const WITH_CUSTOMER = "*, customer:customers(id, full_name, customer_code)";

export async function findVouchersPage(filters: VoucherFilters): Promise<VoucherPage> {
  let query = supabase.from("marketing_vouchers").select(WITH_CUSTOMER, { count: "exact" });

  if (filters.search) {
    const term = filters.search.replace(/[%,]/g, "");
    query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  }
  if (filters.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  query = query.order("created_at", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching vouchers page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingVoucher[]) || [], totalCount: count ?? 0 };
}

export async function findVoucherById(id: string): Promise<MarketingVoucher | null> {
  const { data, error } = await supabase.from("marketing_vouchers").select(WITH_CUSTOMER).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching voucher:", error);
    return null;
  }
  return data as MarketingVoucher | null;
}

export async function findLatestVoucher(): Promise<MarketingVoucher | null> {
  const { data, error } = await supabase
    .from("marketing_vouchers")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Error fetching latest voucher:", error);
    return null;
  }
  return data as MarketingVoucher | null;
}

export async function createVoucher(
  voucher: Omit<MarketingVoucher, "id" | "created_at" | "updated_at" | "customer">
): Promise<MarketingVoucher | null> {
  const { data, error } = await supabase.from("marketing_vouchers").insert(voucher).select().single();
  if (error) {
    console.error("Error creating voucher:", error);
    return null;
  }
  return data as MarketingVoucher;
}

export async function updateVoucher(
  id: string,
  fields: Partial<Pick<MarketingVoucher, "name" | "description" | "customer_id" | "start_date" | "end_date" | "status">>
): Promise<MarketingVoucher | null> {
  const { data, error } = await supabase.from("marketing_vouchers").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating voucher:", error);
    return null;
  }
  return data as MarketingVoucher;
}
