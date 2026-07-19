import { supabase } from "./supabase";
import { Option } from "./customer.constants";
import { MasterDataCategory, MasterDataItem } from "@/types/masterData";

export async function getMasterDataItems(
  category: MasterDataCategory
): Promise<MasterDataItem[]> {
  const { data, error } = await supabase
    .from("master_data")
    .select("*")
    .eq("category", category)
    .order("sort_order", { ascending: true })
    .order("value", { ascending: true });

  if (error) {
    console.error("Error fetching master data items:", error);
    return [];
  }

  return data as MasterDataItem[];
}

export async function getMasterDataOptions(
  category: MasterDataCategory
): Promise<Option[]> {
  const { data, error } = await supabase
    .from("master_data")
    .select("*")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("value", { ascending: true });

  if (error) {
    console.error("Error fetching master data options:", error);
    return [];
  }

  return (data as MasterDataItem[]).map((item) => ({
    value: item.value,
    label: item.value,
  }));
}

export async function addMasterDataItem(category: MasterDataCategory, value: string) {
  const existing = await getMasterDataItems(category);
  const nextSortOrder = existing.length;

  console.log("addMasterDataItem payload:", { category, value });

  const { data, error } = await supabase
    .from("master_data")
    .insert({ category, value, sort_order: nextSortOrder })
    .select()
    .single();

  if (error) {
    console.error("Error adding master data item:", error);
    const isDuplicate = error.code === "23505";
    return { data: null, error, isDuplicate };
  }

  return { data, error: null, isDuplicate: false };
}

export async function updateMasterDataItem(id: string, value: string) {
  const { data, error } = await supabase
    .from("master_data")
    .update({ value })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating master data item:", error);
    const isDuplicate = error.code === "23505";
    return { data: null, error, isDuplicate };
  }

  return { data, error: null, isDuplicate: false };
}

export async function setMasterDataActive(id: string, isActive: boolean) {
  const { data, error } = await supabase
    .from("master_data")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating master data item status:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function deleteMasterDataItem(id: string) {
  const { error } = await supabase.from("master_data").delete().eq("id", id);

  if (error) {
    console.error("Error deleting master data item:", error);
  }

  return error;
}

/** Where each category's value is actually referenced, so delete can
 * refuse to remove a value still in use rather than orphaning rows. */
const USAGE_CHECKS: Partial<Record<MasterDataCategory, { table: string; column: string }[]>> = {
  salesperson: [
    { table: "products", column: "salesperson" },
    { table: "customers", column: "assigned_salesperson" },
  ],
  product_source: [{ table: "products", column: "source" }],
  customer_stage: [{ table: "customers", column: "vip_level" }],
  product_category: [{ table: "products", column: "category" }],
  product_color: [{ table: "products", column: "color" }],
  market: [{ table: "customers", column: "province" }],
  country: [{ table: "customers", column: "country" }],
};

export async function isMasterDataValueInUse(
  category: MasterDataCategory,
  value: string
): Promise<boolean> {
  const checks = USAGE_CHECKS[category] || [];

  for (const { table, column } of checks) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(column, value);

    if (error) {
      console.error(`Error checking usage of ${category}="${value}" in ${table}.${column}:`, error);
      continue;
    }
    if ((count || 0) > 0) return true;
  }

  return false;
}

/** Swaps sort_order with the adjacent item so "Thêm" always appends to the
 * end but existing items can still be reordered without a drag-and-drop UI. */
export async function moveMasterDataItem(items: MasterDataItem[], id: string, direction: "up" | "down") {
  const index = items.findIndex((i) => i.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return;

  const current = items[index];
  const target = items[targetIndex];

  const results = await Promise.all([
    supabase.from("master_data").update({ sort_order: target.sort_order }).eq("id", current.id),
    supabase.from("master_data").update({ sort_order: current.sort_order }).eq("id", target.id),
  ]);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("Error moving master data item:", failed.error);
    return failed.error;
  }

  return null;
}
