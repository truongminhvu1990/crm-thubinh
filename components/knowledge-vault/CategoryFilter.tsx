"use client";

import { cn } from "@/lib/utils";
import { KNOWLEDGE_CATEGORIES } from "@/lib/knowledgeVault/knowledge.constants";
import { CategoryCount } from "@/lib/knowledgeVault/knowledgeVault.service";

interface Props {
  counts: CategoryCount[];
  totalCount: number;
  selected: string | null; // null = "All"
  onSelect: (category: string | null) => void;
}

// Knowledge Categories filter - KNOWLEDGE_VAULT_UI.md §1.2. Each chip shows
// Category Name + Entry Count (Decision 6). Display-only filter labels - no
// add/edit/remove/reorder control (Spec §1.6, permanent read-only).
export default function CategoryFilter({ counts, totalCount, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/70"
        )}
      >
        Tất cả ({totalCount})
      </button>
      {KNOWLEDGE_CATEGORIES.map(({ value, label }) => {
        const count = counts.find((c) => c.category === value)?.count ?? 0;
        return (
          <button
            key={value}
            type="button"
            onClick={() => onSelect(value)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors",
              selected === value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {label} ({count})
          </button>
        );
      })}
    </div>
  );
}
