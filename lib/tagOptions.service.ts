import { supabase } from "./supabase";
import { Option } from "./customer.constants";
import { TagCategory, TagOption } from "@/types/tagOptions";

export async function getTagOptions(category: TagCategory): Promise<Option[]> {
  const { data, error } = await supabase
    .from("tag_options")
    .select("value")
    .eq("category", category)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("value", { ascending: true });

  if (error) {
    console.error("Error fetching tag options:", error);
    return [];
  }

  return (data as { value: string }[]).map((item) => ({
    value: item.value,
    label: item.value,
  }));
}

export async function createTagOption(category: TagCategory, value: string) {
  const { error } = await supabase.from("tag_options").insert({ category, value });

  // A duplicate just means another tab/user already created it - the value
  // is usable either way, so it isn't surfaced as a failure.
  if (error && error.code !== "23505") {
    console.error("Error creating tag option:", error);
    return { error };
  }

  return { error: null };
}

/** Admin-facing counterpart to getTagOptions() - includes disabled rows, for
 * the Settings > Master Data > Tags management table. */
export async function getAllTagOptions(category: TagCategory): Promise<TagOption[]> {
  const { data, error } = await supabase
    .from("tag_options")
    .select("*")
    .eq("category", category)
    .order("sort_order", { ascending: true })
    .order("value", { ascending: true });

  if (error) {
    console.error("Error fetching all tag options:", error);
    return [];
  }

  return data as TagOption[];
}

export async function addTagOption(category: TagCategory, value: string) {
  const existing = await getAllTagOptions(category);
  const nextSortOrder = existing.length;

  const { data, error } = await supabase
    .from("tag_options")
    .insert({ category, value, sort_order: nextSortOrder })
    .select()
    .single();

  if (error) {
    console.error("Error adding tag option:", error);
    const isDuplicate = error.code === "23505";
    return { data: null, error, isDuplicate };
  }

  return { data, error: null, isDuplicate: false };
}

export async function updateTagOption(id: string, value: string) {
  const { data, error } = await supabase
    .from("tag_options")
    .update({ value })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating tag option:", error);
    const isDuplicate = error.code === "23505";
    return { data: null, error, isDuplicate };
  }

  return { data, error: null, isDuplicate: false };
}

export async function setTagOptionActive(id: string, isActive: boolean) {
  const { data, error } = await supabase
    .from("tag_options")
    .update({ is_active: isActive })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating tag option status:", error);
    return { data: null, error };
  }

  return { data, error: null };
}

export async function deleteTagOption(id: string) {
  const { error } = await supabase.from("tag_options").delete().eq("id", id);

  if (error) {
    console.error("Error deleting tag option:", error);
  }

  return error;
}

/** Same "check for references before deleting" shape as
 * isMasterDataValueInUse - tag_options values are referenced as
 * comma-separated substrings on customers/products, so an exact `.eq()`
 * check can't be used; a substring check via `.ilike()` is the closest
 * available signal without parsing every row's multi-value field. */
const USAGE_CHECKS: Partial<Record<TagCategory, { table: string; column: string }[]>> = {
  favorite_color: [{ table: "customers", column: "favorite_color" }],
  jade_type: [{ table: "customers", column: "favorite_type" }],
  purchase_purpose: [{ table: "customers", column: "purpose" }],
  product_jade_grade: [{ table: "products", column: "jade_grade" }],
  customer_tag: [{ table: "customers", column: "customer_tags" }],
};

export async function isTagOptionValueInUse(category: TagCategory, value: string): Promise<boolean> {
  const checks = USAGE_CHECKS[category] || [];

  for (const { table, column } of checks) {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .ilike(column, `%${value}%`);

    if (error) {
      console.error(`Error checking usage of tag ${category}="${value}" in ${table}.${column}:`, error);
      continue;
    }
    if ((count || 0) > 0) return true;
  }

  return false;
}

/** Swaps sort_order with the adjacent item, same pattern as
 * moveMasterDataItem in lib/masterData.service.ts. */
export async function moveTagOption(items: TagOption[], id: string, direction: "up" | "down") {
  const index = items.findIndex((i) => i.id === id);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= items.length) return;

  const current = items[index];
  const target = items[targetIndex];

  const results = await Promise.all([
    supabase.from("tag_options").update({ sort_order: target.sort_order }).eq("id", current.id),
    supabase.from("tag_options").update({ sort_order: current.sort_order }).eq("id", target.id),
  ]);

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error("Error moving tag option:", failed.error);
    return failed.error;
  }

  return null;
}
