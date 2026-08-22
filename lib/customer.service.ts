import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { Customer, CustomerNote } from "@/types/customer";
import { Staff } from "@/types/staff";
import { parseMultiValue, serializeMultiValue, generateUUID, formatDate } from "./utils";
import { CUSTOMER_STATUS_OPTIONS, labelFor, getFollowUpUrgency, FOLLOWUP_COMPLETED_MESSAGE } from "./customer.constants";
import { logActivity } from "./activityLog.service";
import { getCurrentStaff } from "@/lib/permission";
import { applyDataScope } from "@/lib/permission/dataScope";

export { parseMultiValue, serializeMultiValue };

const WRITABLE_FIELDS: (keyof Customer)[] = [
  "customer_code",
  "full_name",
  "phone",
  "facebook",
  "zalo",
  "birthday",
  "address",
  "vip_level",
  "source",
  "notes",
  "last_contacted",
  "gender",
  "occupation",
  "country",
  "province",
  "district",
  "wrist_size",
  "ring_size",
  "favorite_type",
  "favorite_color",
  "preferred_origin",
  "budget",
  "purpose",
  "assigned_salesperson",
  "assigned_staff_id",
  "last_viewed_product",
  "customer_tags",
  "customer_status",
  "next_followup_date",
  "followup_note",
];

function pickWritableFields(
  customer: Partial<Customer>,
  { skipEmpty = false }: { skipEmpty?: boolean } = {}
): Partial<Customer> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    let value = customer[field];
    if (value === undefined) return;
    if (skipEmpty && value === "") return;
    // assigned_staff_id is a uuid column - an empty-string Select value
    // (the "no staff" placeholder) must become null, not "", or Postgres
    // rejects the write.
    if (field === "assigned_staff_id" && value === "") value = null;
    filteredData[field] = value;
  });
  return filteredData as Partial<Customer>;
}

/** Customer Visibility Engine (Package 4B, LOCKED architecture decision):
 * Customer Profile is a shared company asset - anyone with Customer
 * permission may search/view/select any customer, regardless of role or
 * team. This is deliberately UNSCOPED - no Own/Team/All restriction is
 * ever applied to Customer Profile reads, unlike Purchase History
 * (lib/purchase.service.ts / lib/permission/purchaseHistoryVisibility.ts),
 * which is scoped independently. Prior to Package 4B this function applied
 * `applyDataScope(..., "customers")` - the same admin-configurable
 * mechanism used for ownership-restricted resources - which happened to be
 * harmless only because `role_data_scopes` for "customers" is seeded 100%
 * 'all'; narrowing it via the Data Scope Matrix would have silently broken
 * this rule. Removed entirely rather than left "correctly configured," so
 * there is no admin setting that can violate it. */
export async function getCustomers(
  searchTerm?: string,
  vipLevel?: string
): Promise<Customer[]> {
  let query = supabase.from("customers").select("*");

  if (searchTerm) {
    query = query.or(
      `full_name.ilike.%${searchTerm}%,customer_code.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`
    );
  }

  if (vipLevel) {
    query = query.eq("vip_level", vipLevel);
  }

  const { data, error } = await query.order("created_at", {
    ascending: false,
  });

  if (error) {
    console.error("Error fetching customers:", error);
    return [];
  }

  return data as Customer[];
}

/** See getCustomers() above - Customer Profile is always fully shared,
 * never Data-Scope-restricted (Package 4B). */
export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single();

  if (error) {
    console.error("Error fetching customer:", error);
    return null;
  }

  return data as Customer;
}

/** Phone is the primary duplicate key (business rule). Exact match only -
 * no fuzzy matching. `excludeId` leaves out the record being edited so a
 * customer's own phone never flags itself as a duplicate. */
export async function findCustomerByPhone(
  phone: string,
  excludeId?: string
): Promise<Customer | null> {
  let query = supabase.from("customers").select("*").eq("phone", phone);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    console.error("Error checking for duplicate phone:", error);
    return null;
  }

  return data as Customer | null;
}

export async function addCustomer(customer: Partial<Customer>) {
  // New customers start at the first VIP Care pipeline stage unless the
  // caller already set one explicitly.
  const filteredData = pickWritableFields(
    { customer_status: "New", ...customer },
    { skipEmpty: true }
  );

  const { data, error } = await supabase
    .from("customers")
    .insert(filteredData)
    .select()
    .single();

  if (error) {
    console.error("Error adding customer:", error);
    return { data: null, error };
  }

  if (filteredData.assigned_staff_id) {
    logActivity({
      staff_id: filteredData.assigned_staff_id,
      action: "assigned",
      entity: "customer",
      entity_id: data.id,
    });
  }

  return { data, error: null };
}

export async function updateCustomer(id: string, customer: Partial<Customer>) {
  const filteredData = pickWritableFields(customer);

  // Feature 4/8 - Customer Assignment + Activity Log: only worth a read
  // when the caller's payload actually touches assigned_staff_id (every
  // Customer edit submits the full form, so this key is present on nearly
  // every save - comparing against the prior value keeps the log limited
  // to real assignment changes, not every unrelated field edit).
  let previousAssignedStaffId: string | null = null;
  if ("assigned_staff_id" in filteredData) {
    const { data: existing } = await supabase
      .from("customers")
      .select("assigned_staff_id")
      .eq("id", id)
      .maybeSingle();
    previousAssignedStaffId = existing?.assigned_staff_id ?? null;
  }

  const { data, error } = await supabase
    .from("customers")
    .update(filteredData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating customer:", error);
    return { data: null, error };
  }

  if ("assigned_staff_id" in filteredData) {
    const newStaffId = (filteredData.assigned_staff_id as string | null) ?? null;
    if (newStaffId !== previousAssignedStaffId) {
      logActivity({
        staff_id: newStaffId || previousAssignedStaffId,
        action: newStaffId ? "assigned" : "unassigned",
        entity: "customer",
        entity_id: id,
      });
    }
  }

  return { data, error: null };
}

export async function deleteCustomer(id: string) {
  const { error } = await supabase.from("customers").delete().eq("id", id);

  if (error) {
    console.error("Error deleting customer:", error);
  }

  return error;
}

export async function updateLastContacted(id: string) {
  return updateCustomer(id, {
    last_contacted: new Date().toISOString(),
  });
}

// Notes are stored as a JSON-serialized CustomerNote[] inside the existing
// `notes` text column, so the timeline needs no schema change. Older rows
// may hold a plain-text note from before the timeline existed; that value
// is preserved as a single read-only legacy entry rather than discarded.
export function parseCustomerNotes(raw?: string | null): CustomerNote[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as CustomerNote[];
    return [];
  } catch {
    return [{ id: "legacy", content: raw, created_at: "" }];
  }
}

function serializeCustomerNotes(notes: CustomerNote[]): string {
  return JSON.stringify(notes);
}

export async function saveCustomerNotes(id: string, notes: CustomerNote[]) {
  return updateCustomer(id, { notes: serializeCustomerNotes(notes) });
}

export async function addCustomerNote(
  id: string,
  currentNotes: CustomerNote[],
  content: string,
  { markContacted = false }: { markContacted?: boolean } = {}
) {
  const note: CustomerNote = {
    id: generateUUID(),
    content,
    created_at: new Date().toISOString(),
  };
  const payload: Partial<Customer> = {
    notes: serializeCustomerNotes([note, ...currentNotes]),
  };
  if (markContacted) payload.last_contacted = note.created_at;
  return updateCustomer(id, payload);
}

export async function updateCustomerNote(
  id: string,
  currentNotes: CustomerNote[],
  noteId: string,
  content: string
) {
  const notes = currentNotes.map((n) =>
    n.id === noteId ? { ...n, content, updated_at: new Date().toISOString() } : n
  );
  return saveCustomerNotes(id, notes);
}

export async function deleteCustomerNote(
  id: string,
  currentNotes: CustomerNote[],
  noteId: string
) {
  return saveCustomerNotes(id, currentNotes.filter((n) => n.id !== noteId));
}

// VIP Care - Status/Tags/Follow-up all write through here rather than the
// general updateCustomer() call sites elsewhere, because each one also
// appends a typed entry into the same notes-JSON timeline that already
// backs the "Timeline" card, so the Customer Timeline (Feature 4) reflects
// them without a separate audit table.

function timelineEvent(type: CustomerNote["type"], content: string): CustomerNote {
  return { id: generateUUID(), type, content, created_at: new Date().toISOString() };
}

export async function updateCustomerStatus(
  id: string,
  currentNotes: CustomerNote[],
  newStatus: string,
  previousStatus?: string | null
) {
  const events: CustomerNote[] = [];
  const changed = newStatus !== previousStatus;
  if (changed) {
    const from = (previousStatus && labelFor(CUSTOMER_STATUS_OPTIONS, previousStatus)) || "Chưa đặt";
    const to = labelFor(CUSTOMER_STATUS_OPTIONS, newStatus) || newStatus;
    events.push(timelineEvent("status_changed", `Trạng thái: ${from} → ${to}`));
  }
  return updateCustomer(id, {
    customer_status: newStatus,
    // Business rule (Follow-up Center, Sprint v1.1.1): Last Contact Date
    // also updates when Customer Status changes.
    ...(changed ? { last_contacted: new Date().toISOString() } : {}),
    notes: serializeCustomerNotes([...events, ...currentNotes]),
  });
}

export async function updateCustomerTags(
  id: string,
  currentNotes: CustomerNote[],
  newTags: string[],
  previousTags: string[]
) {
  const added = newTags.filter((t) => !previousTags.includes(t));
  const removed = previousTags.filter((t) => !newTags.includes(t));
  const events: CustomerNote[] = [];
  if (added.length) events.push(timelineEvent("tag_added", `Đã thêm tag: ${added.join(", ")}`));
  if (removed.length) events.push(timelineEvent("tag_removed", `Đã gỡ tag: ${removed.join(", ")}`));
  return updateCustomer(id, {
    customer_tags: serializeMultiValue(newTags),
    notes: serializeCustomerNotes([...events, ...currentNotes]),
  });
}

export async function scheduleFollowUp(
  id: string,
  currentNotes: CustomerNote[],
  date: string,
  note: string
) {
  const event = timelineEvent(
    "followup_updated",
    `Lịch chăm sóc tiếp theo: ${formatDate(date)}${note ? " — " + note : ""}`
  );
  return updateCustomer(id, {
    next_followup_date: date,
    followup_note: note || null,
    notes: serializeCustomerNotes([event, ...currentNotes]),
  });
}

export async function completeFollowUp(id: string, currentNotes: CustomerNote[]) {
  const event = timelineEvent("followup_updated", FOLLOWUP_COMPLETED_MESSAGE);
  return updateCustomer(id, {
    next_followup_date: null,
    followup_note: null,
    // Business rule (Follow-up Center, Sprint v1.1.1): completing a
    // follow-up also updates Last Contact Date.
    last_contacted: new Date().toISOString(),
    notes: serializeCustomerNotes([event, ...currentNotes]),
  });
}

/** Data Scope Rollout (Sprint v4.1), Package 5 - Dashboard's customer-count
 * widget inherits Customers' own resolved scope (DATA_SCOPE_ROLLOUT_UI.md
 * §6), the same scope Package 1 already applies to the Customer List -
 * never a separately-invented Dashboard-only rule.
 *
 * `client`/`staff` (Backend API Foundation, Package 4C, Wave 5 revision) -
 * same injectable-dependency pattern as every other wave: `client` defaults
 * to the browser Supabase client, `staff` is a sentinel (`undefined` means
 * "resolve it yourself via getCurrentStaff(), exactly as before" - Browser
 * Authentication Context; an explicit `Staff | null` means "use this value,
 * I already resolved it" - what app/api/dashboard/** now passes via
 * getCurrentStaffFromRequest(), the same Server Authentication Context
 * pattern Hotfix 3A/4A already established). No change to the Data Scope
 * call itself (applyDataScope, "customers" resource) - only how "current
 * staff" is identified, and which client executes the query. */
export async function getCustomerStats(client: SupabaseClient = supabase, staff?: Staff | null) {
  let query = client.from("customers").select("*");

  const resolvedStaff = staff === undefined ? await getCurrentStaff() : staff;
  if (resolvedStaff) query = (await applyDataScope(query, resolvedStaff, "customers", undefined, client)).query;

  const { data, error } = await query;

  if (error || !data) {
    return {
      total: 0,
      vip: 0,
      normal: 0,
      recentlyContacted: 0,
    };
  }

  const vip = data.filter((c) => c.vip_level === "VIP").length;
  const normal = data.length - vip;
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentlyContacted = data.filter(
    (c) => c.last_contacted && new Date(c.last_contacted) > sevenDaysAgo
  ).length;

  return {
    total: data.length,
    vip,
    normal,
    recentlyContacted,
  };
}

export interface FollowUpSummaryCounts {
  overdue: number;
  today: number;
  next7Days: number;
}

/** Powers the Dashboard "Follow-up Summary" widget and the Sidebar's
 * overdue badge (Follow-up Center, Sprint v1.1.1). Only the date column is
 * selected - this runs on every page via the Sidebar, so it stays cheap. */
export async function getFollowUpSummaryCounts(client: SupabaseClient = supabase): Promise<FollowUpSummaryCounts> {
  const { data, error } = await client.from("customers").select("next_followup_date");

  if (error || !data) {
    return { overdue: 0, today: 0, next7Days: 0 };
  }

  const counts: FollowUpSummaryCounts = { overdue: 0, today: 0, next7Days: 0 };
  data.forEach((c) => {
    const urgency = getFollowUpUrgency(c.next_followup_date);
    if (urgency === "overdue") counts.overdue++;
    else if (urgency === "today") counts.today++;
    else if (urgency === "soon") counts.next7Days++;
  });
  return counts;
}
