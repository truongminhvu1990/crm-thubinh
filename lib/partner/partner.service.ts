import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Partner, CreatePartnerInput, UpdatePartnerInput } from "@/types/partner";
import { logActivity } from "@/lib/activityLog.service";

/** Partner Center (docs/12_PARTNER_CENTER_SPEC.md, LOCKED Rev 3) — owns
 * Partner identity/relationship/status only (§3). Reads accept an
 * injectable client (server route vs browser) — same convention as
 * lib/product.service.ts (Backend API Foundation, Package 4C, Wave 1).
 * Writes always go through the API routes (app/api/partners), which resolve
 * a server client themselves after enforcing partner.create/partner.update —
 * there is no browser-direct write path, unlike Customer/Product. */

const WRITABLE_FIELDS: (keyof Partner)[] = ["name", "partner_type", "phone", "email", "address", "notes", "status"];

function pickWritableFields(input: CreatePartnerInput | UpdatePartnerInput): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = (input as Record<string, unknown>)[field];
    if (value !== undefined) filtered[field] = value;
  });
  return filtered;
}

/** Format `PTR-{YYYYMMDD}-{6-digit sequence}`, daily-reset — mirrors Orders'
 * own generateOrderNumber (lib/orders/order.repository.ts). Same documented
 * race condition under concurrent creation (two requests counting "0 today"
 * at once would both produce sequence 000001); Orders' own generator has
 * the identical caveat and hasn't needed an atomic replacement in practice
 * yet, so this doesn't invent a new pattern to solve it here either. */
async function generatePartnerCode(client: SupabaseClient): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `PTR-${datePart}-`;

  const { data, error } = await client.from("partners").select("id").like("partner_code", `${prefix}%`);
  if (error) throw error;

  const sequence = (data?.length ?? 0) + 1;
  return `${prefix}${String(sequence).padStart(6, "0")}`;
}

export interface PartnerListFilters {
  searchTerm?: string;
  status?: string;
  partnerType?: string;
}

export async function getPartners(filters: PartnerListFilters = {}, client: SupabaseClient = supabase): Promise<Partner[]> {
  let query = client.from("partners").select("*");

  if (filters.searchTerm) {
    query = query.or(
      `name.ilike.%${filters.searchTerm}%,partner_code.ilike.%${filters.searchTerm}%,phone.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%`
    );
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.partnerType) query = query.eq("partner_type", filters.partnerType);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching partners:", error);
    return [];
  }
  return data as Partner[];
}

export async function getPartnerById(id: string, client: SupabaseClient = supabase): Promise<Partner | null> {
  const { data, error } = await client.from("partners").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching partner:", error);
    return null;
  }
  return data as Partner | null;
}

/** Row shape for Partner Detail's Orders section — a thin projection of
 * `orders`, not the full Order type, since this reads across a module
 * boundary (Order Attribution, docs/12_PARTNER_CENTER_SPEC.md §7) via
 * partner_id only, never through Order's own service code. */
export interface PartnerOrderRow {
  id: string;
  order_number: string;
  order_date: string;
  order_status: string;
  total_amount: number;
}

export async function getOrdersByPartnerId(
  partnerId: string,
  client: SupabaseClient = supabase
): Promise<PartnerOrderRow[]> {
  const { data, error } = await client
    .from("orders")
    .select("id, order_number, order_date, order_status, total_amount")
    .eq("partner_id", partnerId)
    .order("order_date", { ascending: false });

  if (error) {
    console.error("Error fetching orders for partner:", error);
    return [];
  }
  return data as PartnerOrderRow[];
}

export interface PartnerOrderStats {
  totalOrders: number;
  successfulOrders: number;
  revenueGenerated: number;
}

/** Total Orders / Successful Orders ("Completed", per ORDERS_DATABASE.md
 * §5's order_status model) / Revenue Generated (sum of total_amount across
 * Completed orders only — an order that never completed generated no
 * revenue). Computed from the same rows getOrdersByPartnerId reads, kept as
 * a separate function so the Detail page can request just the numbers
 * without the full row list when only Partner Statistics is needed. */
export async function getPartnerOrderStats(partnerId: string, client: SupabaseClient = supabase): Promise<PartnerOrderStats> {
  const orders = await getOrdersByPartnerId(partnerId, client);
  const completed = orders.filter((o) => o.order_status === "Completed");
  return {
    totalOrders: orders.length,
    successfulOrders: completed.length,
    revenueGenerated: completed.reduce((sum, o) => sum + (o.total_amount || 0), 0),
  };
}

/** Total Referred Orders for the Partner List table — a lightweight count
 * per partner, batched in one query rather than N+1 (one getOrdersByPartnerId
 * call per row). */
export async function getReferredOrderCounts(
  partnerIds: string[],
  client: SupabaseClient = supabase
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (partnerIds.length === 0) return counts;

  const { data, error } = await client.from("orders").select("partner_id").in("partner_id", partnerIds);
  if (error) {
    console.error("Error fetching referred order counts:", error);
    return counts;
  }

  for (const row of data as { partner_id: string | null }[]) {
    if (!row.partner_id) continue;
    counts.set(row.partner_id, (counts.get(row.partner_id) ?? 0) + 1);
  }
  return counts;
}

export async function createPartner(
  input: CreatePartnerInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Partner> {
  const partner_code = await generatePartnerCode(client);
  const { data, error } = await client
    .from("partners")
    .insert({ ...pickWritableFields(input), partner_code })
    .select()
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "partner_created", entity: "partner", entity_id: data.id });
  return data as Partner;
}

export async function updatePartner(
  id: string,
  changes: UpdatePartnerInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<Partner> {
  const previous = await getPartnerById(id, client);

  const { data, error } = await client
    .from("partners")
    .update(pickWritableFields(changes))
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  if (changes.status && previous && changes.status !== previous.status) {
    const action =
      changes.status === "Active"
        ? "partner_activated"
        : changes.status === "Inactive" || changes.status === "Terminated"
          ? "partner_deactivated"
          : "partner_updated";
    await logActivity({ staff_id: actorStaffId, action, entity: "partner", entity_id: id });
  } else {
    await logActivity({ staff_id: actorStaffId, action: "partner_updated", entity: "partner", entity_id: id });
  }

  return data as Partner;
}
