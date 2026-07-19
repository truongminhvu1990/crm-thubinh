"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";
import SearchInput from "@/components/ui/SearchInput";
import CategoryFilter from "@/components/knowledge-vault/CategoryFilter";
import KnowledgeList from "@/components/knowledge-vault/KnowledgeList";
import {
  getActiveKnowledgeEntries,
  getCategoryCounts,
} from "@/lib/knowledgeVault/knowledgeVault.service";
import { KnowledgeEntry } from "@/types/knowledgeEntry";

/**
 * Read-only Knowledge List, Search, Category Filter, Title ASC sort, Entry
 * Count (docs/KNOWLEDGE_VAULT_SPEC.md Revision 2 + docs/KNOWLEDGE_VAULT_UI.md
 * Revision 2, both LOCKED - Increment 1). No create/edit/delete/attachment
 * control anywhere. Archived entries are excluded at the service layer, not
 * just here. Knowledge Detail is intentionally not implemented yet - list
 * rows are not clickable.
 */
export default function KnowledgeVaultPage() {
  const [entries, setEntries] = useState<KnowledgeEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    getActiveKnowledgeEntries().then(setEntries);
  }, []);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category && entry.category !== category) return false;
      if (!query) return true;
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.body.toLowerCase().includes(query) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    });
  }, [entries, search, category]);

  const categoryCounts = useMemo(() => getCategoryCounts(entries ?? []), [entries]);

  if (entries === null) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  return (
    <div className="pb-8 space-y-6">
      <div className="mb-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-primary" />
          Kho kiến thức
        </h1>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Kiến thức nghiệp vụ dùng cho nhân viên CRM - chỉ đọc.
        </p>
      </div>

      <SearchInput
        placeholder="Tìm theo tiêu đề, thẻ hoặc nội dung..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onClear={() => setSearch("")}
      />

      <CategoryFilter
        counts={categoryCounts}
        totalCount={entries.length}
        selected={category}
        onSelect={setCategory}
      />

      <KnowledgeList entries={filtered} hasAnyEntries={entries.length > 0} />
    </div>
  );
}
