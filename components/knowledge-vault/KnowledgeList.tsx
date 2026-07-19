"use client";

import { BookOpen } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { KnowledgeEntry } from "@/types/knowledgeEntry";
import { labelFor, KNOWLEDGE_CATEGORIES } from "@/lib/knowledgeVault/knowledge.constants";

interface Props {
  entries: KnowledgeEntry[];
  hasAnyEntries: boolean; // distinguishes "no entries at all" from "no matches"
}

function excerpt(body: string, max = 140): string {
  if (body.length <= max) return body;
  return `${body.slice(0, max).trimEnd()}…`;
}

const dateFormat = new Intl.DateTimeFormat("vi-VN");

// Knowledge List - KNOWLEDGE_VAULT_UI.md §1.3. Read-only: no edit/delete/
// create affordance on any row (Spec §1.6). Rows are not clickable - Knowledge
// Detail is explicitly out of scope for this increment.
export default function KnowledgeList({ entries, hasAnyEntries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
        <BookOpen className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          {hasAnyEntries ? "Không tìm thấy kết quả" : "Chưa có nội dung trong Kho kiến thức"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.id} className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <h3 className="font-semibold text-foreground text-sm sm:text-base">{entry.title}</h3>
            <Badge variant="muted" className="shrink-0">
              {labelFor(KNOWLEDGE_CATEGORIES, entry.category) ?? entry.category}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-2">{excerpt(entry.body)}</p>
          <p className="text-xs text-muted-foreground/70">
            Cập nhật: {dateFormat.format(new Date(entry.last_updated))}
          </p>
        </Card>
      ))}
    </div>
  );
}
