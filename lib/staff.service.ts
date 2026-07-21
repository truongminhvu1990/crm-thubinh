import { supabase } from "./supabase";
import { Staff } from "@/types/staff";
import { Customer } from "@/types/customer";
import { logActivity } from "./activityLog.service";

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

export async function getStaffList(searchTerm?: string): Promise<Staff[]> {
  let query = supabase.from("staff").select("*");

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
export async function getStaffByName(fullName: string): Promise<Staff | null> {
  const { data, error } = await supabase.from("staff").select("*").eq("full_name", fullName).maybeSingle();

  if (error) {
    console.error("Error resolving staff by name:", error);
    return null;
  }
  return data as Staff | null;
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

export async function addStaff(staff: Partial<Staff>) {
  const filteredData = pickWritableFields(staff);

  const { data, error } = await supabase.from("staff").insert(filteredData).select().single();

  if (error) {
    console.error("Error adding staff member:", error);
    return { data: null, error };
  }

  await logActivity({ staff_id: data.id, action: "created", entity: "staff", entity_id: data.id });
  return { data: data as Staff, error: null };
}

export async function updateStaff(id: string, staff: Partial<Staff>) {
  const filteredData = pickWritableFields(staff);

  const { data, error } = await supabase.from("staff").update(filteredData).eq("id", id).select().single();

  if (error) {
    console.error("Error updating staff member:", error);
    return { data: null, error };
  }

  await logActivity({ staff_id: id, action: "updated", entity: "staff", entity_id: id });
  return { data: data as Staff, error: null };
}

export async function deleteStaff(id: string) {
  const { error } = await supabase.from("staff").delete().eq("id", id);
  if (error) console.error("Error deleting staff member:", error);
  return error;
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

export interface StaffRevenueSummary {
  count: number;
  totalRevenue: number;
}

/** Staff Detail's "Sales Revenue" section. */
export async function getStaffRevenue(staff: Pick<Staff, "id" | "full_name">): Promise<StaffRevenueSummary> {
  const { data, error } = await supabase
    .from("customer_purchases")
    .select("salesperson_id, salesperson, sale_price");

  if (error || !data) {
    if (error) console.error("Error fetching staff revenue:", error);
    return { count: 0, totalRevenue: 0 };
  }

  const rows = (data as { salesperson_id: string | null; salesperson: string | null; sale_price: number }[]).filter(
    (r) => matchesStaff(r, staff)
  );
  return {
    count: rows.length,
    totalRevenue: rows.reduce((sum, r) => sum + (Number(r.sale_price) || 0), 0),
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

/** Feature 9 - Dashboard "Top Sales Staff" widget. Ranked by revenue desc. */
export async function getTopSalesStaff(limit = 5): Promise<TopSalesStaffEntry[]> {
  const [staffList, purchasesRes, commissionsRes] = await Promise.all([
    getStaffList(),
    supabase.from("customer_purchases").select("salesperson_id, salesperson, sale_price"),
    supabase.from("sales_commissions").select("salesperson_id, salesperson, commission_amount"),
  ]);

  const purchases =
    (purchasesRes.data as { salesperson_id: string | null; salesperson: string | null; sale_price: number }[]) || [];
  const commissions =
    (commissionsRes.data as { salesperson_id: string | null; salesperson: string | null; commission_amount: number }[]) ||
    [];

  const entries = staffList
    .filter((s) => s.status === "Active")
    .map((staff) => {
      const revenue = purchases
        .filter((p) => matchesStaff(p, staff))
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
