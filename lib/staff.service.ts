import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Staff } from "@/types/staff";
import { Customer } from "@/types/customer";
import { logActivity } from "./activityLog.service";
import { DateRange } from "./dateFilter";

const WRITABLE_FIELDS: (keyof Staff)[] = [
  "staff_code",
  "full_name",
  "phone",
  "email",
  "role",
  "status",
  "joined_date",
  "avatar",
  "note",
];

function pickWritableFields(staff: Partial<Staff>): Partial<Staff> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = staff[field];
    if (value === undefined) return;
    filteredData[field] = value;
  });
  return filteredData as Partial<Staff>;
}

/** `client` (Backend API Foundation, Package 4C, Wave 5 revision) - same
 * injectable-dependency pattern as every other wave; defaults to the
 * browser Supabase client so every existing caller (Settings' Roles/Teams
 * pages, useStaffOptions, etc.) keeps its exact current behavior. */
export async function getStaffList(searchTerm?: string, client: SupabaseClient = supabase): Promise<Staff[]> {
  let query = client.from("staff").select("*");

  if (searchTerm) {
    query = query.or(
      `full_name.ilike.%${searchTerm}%,staff_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
    );
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching staff:", error);
    return [];
  }
  return data as Staff[];
}

export async function getStaffById(id: string): Promise<Staff | null> {
  const { data, error } = await supabase.from("staff").select("*").eq("id", id).single();

  if (error) {
    console.error("Error fetching staff member:", error);
    return null;
  }
  return data as Staff;
}

/** Feature 5 - Salesperson Migration: resolves a legacy free-text
 * salesperson name (copied from products.salesperson) to a structured staff
 * record, so new purchases can save salesperson_id alongside the text.
 * Exact-match only, same convention as the rest of this migration - no
 * fuzzy matching. Returns null (not an error) when no staff member has that
 * exact name, which is expected for names that were never onboarded as
 * staff. */
export async function getStaffByName(fullName: string, client: SupabaseClient = supabase): Promise<Staff | null> {
  const { data, error } = await client.from("staff").select("*").eq("full_name", fullName).maybeSingle();

  if (error) {
    console.error("Error resolving staff by name:", error);
    return null;
  }
  return data as Staff | null;
}

/** Production Authentication Hotfix V2, Package 3 - backs email-uniqueness
 * validation both in the UI (app/settings/staff/page.tsx handleSaveStaff)
 * and, as of the same hotfix's follow-up, inside addStaff()/updateStaff()
 * themselves (see validateStaffEmail below). Case-insensitive (`ilike`
 * with no wildcards - Postgres's case-insensitive exact-match operator),
 * matching the case-insensitive `staff_email_unique` partial unique index
 * (20260730_staff_email_unique_index.sql) this backs at the DB layer. */
export async function getStaffByEmail(email: string, client: SupabaseClient = supabase): Promise<Staff | null> {
  const { data, error } = await client.from("staff").select("*").ilike("email", email).maybeSingle();

  if (error) {
    console.error("Error resolving staff by email:", error);
    return null;
  }
  return data as Staff | null;
}

export interface StaffServiceError {
  code: "EMAIL_REQUIRED" | "EMAIL_DUPLICATE";
  message: string;
}

/** Production Authentication Hotfix V2 - email validation moved into the
 * service layer (this codebase's write boundary for Staff, called directly
 * by every client component - the "Staff API" in an architecture with no
 * dedicated Next.js API route for staff writes). Runs before any DB write
 * so a caller that bypasses a page's own pre-check (a future API route, a
 * script, a modified client, or - today - app/settings/staff/[id]/page.tsx,
 * which has no pre-check of its own) still can't create or update a staff
 * row with a missing or duplicate email. "Never rely on UI validation
 * only." */
async function validateStaffEmail(
  email: string | null | undefined,
  excludeStaffId?: string
): Promise<StaffServiceError | null> {
  const trimmed = email?.trim();
  if (!trimmed) {
    return { code: "EMAIL_REQUIRED", message: "Email là bắt buộc" };
  }
  const existing = await getStaffByEmail(trimmed);
  if (existing && existing.id !== excludeStaffId) {
    return { code: "EMAIL_DUPLICATE", message: "Email đã tồn tại" };
  }
  return null;
}

/** Same "prefix + running number" convention as getNextBatchCode()
 * (lib/productBatch.service.ts). */
export async function getNextStaffCode(): Promise<string> {
  const { data, error } = await supabase.from("staff").select("staff_code");

  if (error || !data) {
    if (error) console.error("Error computing next staff code:", error);
    return "NV1";
  }

  const maxN = (data as { staff_code: string }[]).reduce((max, row) => {
    const match = row.staff_code?.match(/^NV(\d+)$/i);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);

  return `NV${maxN + 1}`;
}

/** Staff Creation. Stores `email` as a plain column - validated required
 * and unique server-side, in this function, before any write (Production
 * Authentication Hotfix V2 - "move email validation into the Staff API,
 * never rely on UI validation only"). Does NOT create a Supabase Auth
 * account or populate `auth_user_id`.
 *
 * Superseded for new staff by Staff Identity & Authentication Foundation's
 * POST /api/staff (lib/auth/createStaffWithAuth.ts), which is now the only
 * allowed way to create a staff member (Business Rule 3 - never from the
 * Supabase Dashboard, and every staff row must have an Auth account). Kept
 * here only because updateStaff() below reuses validateStaffEmail()/
 * pickWritableFields() - not called from anywhere for new staff creation
 * anymore. */
export async function addStaff(staff: Partial<Staff>) {
  const emailError = await validateStaffEmail(staff.email);
  if (emailError) return { data: null, error: emailError };

  const filteredData = pickWritableFields(staff);

  const { data, error } = await supabase.from("staff").insert(filteredData).select().single();

  if (error) {
    console.error("Error adding staff member:", error);
    return { data: null, error };
  }

  await logActivity({ staff_id: data.id, action: "created", entity: "staff", entity_id: data.id });
  return { data: data as Staff, error: null };
}

/** Same server-side email validation as addStaff() above, excluding this
 * row's own id from the duplicate check so saving a staff member without
 * changing their email doesn't flag itself as a duplicate. */
export async function updateStaff(id: string, staff: Partial<Staff>) {
  const emailError = await validateStaffEmail(staff.email, id);
  if (emailError) return { data: null, error: emailError };

  const filteredData = pickWritableFields(staff);

  const { data, error } = await supabase.from("staff").update(filteredData).eq("id", id).select().single();

  if (error) {
    console.error("Error updating staff member:", error);
    return { data: null, error };
  }

  await logActivity({ staff_id: id, action: "updated", entity: "staff", entity_id: id });
  return { data: data as Staff, error: null };
}

/** Staff Identity & Authentication Foundation, Required Change 2 - Business
 * Rule 6: staff can never be deleted, only moved to a terminal status.
 * Replaces the old deleteStaff() (hard `.delete()`), which is no longer
 * exposed anywhere - preserves the row (and its history: activity_logs,
 * commissions, assigned customers, etc. all keep their FK intact) instead
 * of removing it. */
export async function archiveStaff(id: string) {
  const { error } = await supabase.from("staff").update({ status: "Archived" }).eq("id", id);
  if (error) {
    console.error("Error archiving staff member:", error);
    return error;
  }
  await logActivity({ staff_id: id, action: "archived", entity: "staff", entity_id: id });
  return null;
}

/** Feature 4 - Customer Assignment: customers whose one primary staff is
 * this staff member. Backs Staff Detail's "Assigned Customers" section. */
export async function getCustomersByAssignedStaff(staffId: string): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("assigned_staff_id", staffId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching assigned customers:", error);
    return [];
  }
  return data as Customer[];
}

/** Feature 5/6: a purchase/commission row belongs to a staff member if its
 * salesperson_id matches, or - for rows created before this module existed,
 * which never had salesperson_id populated - if its legacy salesperson text
 * matches the staff member's name exactly. salesperson_id always wins when
 * present, per the spec's "if available, otherwise fallback" rule. */
export function matchesStaff(
  row: { salesperson_id?: string | null; salesperson?: string | null },
  staff: Pick<Staff, "id" | "full_name">
): boolean {
  if (row.salesperson_id) return row.salesperson_id === staff.id;
  return !!row.salesperson && row.salesperson === staff.full_name;
}

/** BR-001 Revenue Recognition (docs/ORDERS_SPEC.md "Business Rule Lock",
 * LOCKED): revenue counts only when Order Status = Completed AND Payment
 * Status = Paid. A row with no linked Order (order_item_id NULL - predates
 * the Orders module, or entered manually) has no Order to check and
 * counts as recognized, same as it always has. */
function isRevenueRecognized(row: {
  order_item_id: string | null;
  order_items: { orders: { order_status: string; payment_status: string } | null } | null;
}): boolean {
  if (!row.order_item_id) return true;
  const order = row.order_items?.orders;
  return order?.order_status === "Completed" && order?.payment_status === "Paid";
}

export interface StaffRevenueSummary {
  count: number;
  totalRevenue: number;
}

/** Staff Detail's "Sales Revenue" section. */
export async function getStaffRevenue(staff: Pick<Staff, "id" | "full_name">): Promise<StaffRevenueSummary> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("salesperson_id, salesperson, sale_price, order_item_id, order_items(orders(order_status, payment_status))");

  if (error || !data) {
    if (error) console.error("Error fetching staff revenue:", error);
    return { count: 0, totalRevenue: 0 };
  }

  const rows = (
    data as unknown as {
      salesperson_id: string | null;
      salesperson: string | null;
      sale_price: number;
      order_item_id: string | null;
      order_items: { orders: { order_status: string; payment_status: string } | null } | null;
    }[]
  ).filter((r) => matchesStaff(r, staff));
  return {
    count: rows.length,
    totalRevenue: rows.reduce((sum, r) => sum + (isRevenueRecognized(r) ? Number(r.sale_price) || 0 : 0), 0),
  };
}

export interface StaffCommissionSummary {
  totalCommission: number;
  pending: number;
  approved: number;
  paid: number;
}

/** Staff Detail's "Commission" section. Reads sales_commissions only, same
 * source as the Dashboard Commission widget - never customer_purchases. */
export async function getStaffCommissionSummary(
  staff: Pick<Staff, "id" | "full_name">
): Promise<StaffCommissionSummary> {
  const { data, error } = await supabase
    .from("sales_commissions")
    .select("salesperson_id, salesperson, commission_amount, status");

  const summary: StaffCommissionSummary = { totalCommission: 0, pending: 0, approved: 0, paid: 0 };

  if (error || !data) {
    if (error) console.error("Error fetching staff commission:", error);
    return summary;
  }

  const rows = (
    data as { salesperson_id: string | null; salesperson: string | null; commission_amount: number; status: string }[]
  ).filter((r) => matchesStaff(r, staff));

  for (const r of rows) {
    const amount = Number(r.commission_amount) || 0;
    summary.totalCommission += amount;
    if (r.status === "Pending") summary.pending += amount;
    else if (r.status === "Approved") summary.approved += amount;
    else if (r.status === "Paid") summary.paid += amount;
  }
  return summary;
}

export interface TopSalesStaffEntry {
  staff: Staff;
  revenue: number;
  commission: number;
}

/** Feature 9 - Dashboard "Top Sales Staff" widget. Ranked by revenue desc.
 * `client` (Backend API Foundation, Package 4C, Wave 5 revision) - same
 * injectable-dependency pattern as every other wave; defaults to the
 * browser Supabase client. Threaded into getStaffList() too so every query
 * this function makes goes through the same client. */
export async function getTopSalesStaff(
  limit = 5,
  client: SupabaseClient = supabase,
  range: DateRange | null = null
): Promise<TopSalesStaffEntry[]> {
  let purchasesQuery = client
    .from("customer_purchases")
    .select("salesperson_id, salesperson, sale_price, order_item_id, order_items(orders(order_status, payment_status))");
  let commissionsQuery = client.from("sales_commissions").select("salesperson_id, salesperson, commission_amount");
  if (range) {
    purchasesQuery = purchasesQuery.gte("sale_date", range.start).lt("sale_date", range.end);
    commissionsQuery = commissionsQuery.gte("created_at", range.start).lt("created_at", range.end);
  }

  const [staffList, purchasesRes, commissionsRes] = await Promise.all([
    getStaffList(undefined, client),
    purchasesQuery,
    commissionsQuery,
  ]);

  const purchases =
    (purchasesRes.data as unknown as {
      salesperson_id: string | null;
      salesperson: string | null;
      sale_price: number;
      order_item_id: string | null;
      order_items: { orders: { order_status: string; payment_status: string } | null } | null;
    }[]) || [];
  const commissions =
    (commissionsRes.data as { salesperson_id: string | null; salesperson: string | null; commission_amount: number }[]) ||
    [];

  const entries = staffList
    .filter((s) => s.status === "Active")
    .map((staff) => {
      // BR-001: revenue only counts Completed+Paid orders (or order-less
      // legacy rows) - see isRevenueRecognized above. Commission is a
      // separate concept BR-001 doesn't name and stays unfiltered.
      const revenue = purchases
        .filter((p) => matchesStaff(p, staff) && isRevenueRecognized(p))
        .reduce((sum, p) => sum + (Number(p.sale_price) || 0), 0);
      const commission = commissions
        .filter((c) => matchesStaff(c, staff))
        .reduce((sum, c) => sum + (Number(c.commission_amount) || 0), 0);
      return { staff, revenue, commission };
    })
    .filter((e) => e.revenue > 0 || e.commission > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return entries.slice(0, limit);
}
