"use client";

import Link from "next/link";
import { Cake } from "lucide-react";
import Card from "@/components/ui/Card";
import SearchInput from "@/components/ui/SearchInput";
import Badge from "@/components/ui/Badge";
import { BirthdayBucketCustomer } from "@/types/marketing";
import { formatDate } from "@/lib/utils";

interface Props {
  title: string;
  customers: BirthdayBucketCustomer[];
  isLoading?: boolean;
  emptyMessage: string;
  search?: string;
  onSearchChange?: (value: string) => void;
}

/** One section of the Birthday Center (MARKETING_UI.md §7) - reused 3x for
 * Today/This Week/This Month. Clicking a customer goes to the existing,
 * unmodified Customer Detail page. */
export default function BirthdaySection({ title, customers, isLoading = false, emptyMessage, search, onSearchChange }: Props) {
  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h3 className="font-semibold text-foreground">
          {title} <span className="text-muted-foreground font-normal">({customers.length})</span>
        </h3>
        {onSearchChange && (
          <div className="w-64">
            <SearchInput
              placeholder="Tìm khách hàng..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              onClear={() => onSearchChange("")}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin text-xl">⟳</div>
        </div>
      ) : customers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">
          {customers.map((c) => (
            <Link
              key={c.id}
              href={`/customers/${c.id}`}
              className="flex items-center justify-between text-sm px-3 py-2 rounded-md hover:bg-muted/30"
            >
              <span className="flex items-center gap-2">
                <Cake className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-foreground font-medium">{c.full_name}</span>
                <span className="text-muted-foreground">· {c.phone}</span>
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                {formatDate(c.birthday)}
                {c.vip_level === "VIP" && <Badge variant="vip">VIP</Badge>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
