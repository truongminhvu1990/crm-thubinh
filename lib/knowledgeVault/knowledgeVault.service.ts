import { supabase } from "@/lib/supabase";
import { KnowledgeEntry, KnowledgeCategory } from "@/types/knowledgeEntry";
import { KNOWLEDGE_CATEGORIES } from "./knowledge.constants";

// Knowledge Vault reads its own table only - no Products, Customers,
// Inventory, or Master Data (KNOWLEDGE_VAULT_SPEC.md §1.7, Decision 6).
//
// KNOWN BLOCKER: no `knowledge_entries` table exists in the Development
// database, and no Database Design document/approval exists for Knowledge
// Vault (the workflow went straight from UI Design LOCKED to Development -
// see this increment's Self Review). Per Project Rules, a table is never
// created without explicit Product Owner approval, so this query is written
// against the field contract KNOWLEDGE_VAULT_SPEC.md §1.4 already locked,
// but will fail against the live database until that table exists. The
// catch below fails closed to an empty list (same defensive pattern as
// lib/marketIntelligence/marketIntelligence.service.ts), not a page crash -
// this must not be mistaken for "the vault is genuinely empty."
export async function getActiveKnowledgeEntries(): Promise<KnowledgeEntry[]> {
  const { data, error } = await supabase
    .from("knowledge_entries")
    .select("id, title, category, body, tags, last_updated, status")
    .eq("status", "Active") // Archived entries must never appear - filtered at the query, not just the UI
    .order("title", { ascending: true }); // Title ASC, locked default sort (KNOWLEDGE_VAULT_UI.md Decision 5)

  if (error || !data) {
    if (error) console.error("Error fetching knowledge entries:", error);
    return [];
  }

  return data as unknown as KnowledgeEntry[];
}

export interface CategoryCount {
  category: KnowledgeCategory;
  count: number;
}

// Entry Count per category (KNOWLEDGE_VAULT_UI.md Decision 6), scoped to the
// already-Active-only entries passed in - an Archived entry can never
// contribute to a count shown in the UI.
export function getCategoryCounts(entries: KnowledgeEntry[]): CategoryCount[] {
  return KNOWLEDGE_CATEGORIES.map(({ value }) => ({
    category: value as KnowledgeCategory,
    count: entries.filter((entry) => entry.category === value).length,
  }));
}
