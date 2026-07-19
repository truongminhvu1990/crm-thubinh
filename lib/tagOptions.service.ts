import { supabase } from "./supabase";
import { Option } from "./customer.constants";
import { TagCategory } from "@/types/tagOptions";

export async function getTagOptions(category: TagCategory): Promise<Option[]> {
  const { data, error } = await supabase
    .from("tag_options")
    .select("value")
    .eq("category", category)
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
