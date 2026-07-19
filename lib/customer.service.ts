import { supabase } from "./supabase";
import { Customer, CustomerNote } from "@/types/customer";
import { parseMultiValue, serializeMultiValue, generateUUID } from "./utils";

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
  "last_viewed_product",
];

function pickWritableFields(
  customer: Partial<Customer>,
  { skipEmpty = false }: { skipEmpty?: boolean } = {}
): Partial<Customer> {
  const filteredData: Record<string, unknown> = {};
  WRITABLE_FIELDS.forEach((field) => {
    const value = customer[field];
    if (value === undefined) return;
    if (skipEmpty && value === "") return;
    filteredData[field] = value;
  });
  return filteredData as Partial<Customer>;
}

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

export async function getCustomerById(id: string): Promise<Customer | null> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .single();

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
  const filteredData = pickWritableFields(customer, { skipEmpty: true });

  const { data, error } = await supabase
    .from("customers")
    .insert(filteredData)
    .select()
    .single();

  if (error) {
    console.error("Error adding customer:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function updateCustomer(id: string, customer: Partial<Customer>) {
  const filteredData = pickWritableFields(customer);

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

export async function getCustomerStats() {
  const { data, error } = await supabase.from("customers").select("*");

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
