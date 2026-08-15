"use client";

import Link from "next/link";
import { ArrowUp, ArrowDown, ArrowUpDown, Handshake } from "lucide-react";
import { Partner } from "@/types/partner";
import Badge from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { partnerStatusLabel, partnerTypeLabel } from "@/lib/partner/partner.constants";

const STATUS_BADGE_VARIANT: Record<string, "success" | "warning" | "destructive" | "muted"> = {
  Onboarding: "warning",
  Active: "success",
  Inactive: "muted",
  Terminated: "destructive",
};

export type PartnerSortKey = "name" | "created_at";
export type SortDir = "asc" | "desc";

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

interface Props {
  partners: Partner[];
  /** Total Referred Orders per partner (Order Attribution, partner_id) —
   * absent entry means 0, not "unknown". */
  referredOrderCounts: Map<string, number>;
  isLoading?: boolean;
  sortKey: PartnerSortKey;
  sortDir: SortDir;
  onSort: (key: PartnerSortKey) => void;
}

function SortHeader({
  label,
  sortKeyValue,
  activeSortKey,
  activeSortDir,
  onSort,
}: {
  label: string;
  sortKeyValue: PartnerSortKey;
  activeSortKey: PartnerSortKey;
  activeSortDir: SortDir;
  onSort: (key: PartnerSortKey) => void;
}) {
  const isActive = activeSortKey === sortKeyValue;
  const Icon = isActive ? (activeSortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKeyValue)}
      className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground"
    >
      {label}
      <Icon className={isActive ? "w-3 h-3 text-primary" : "w-3 h-3"} />
    </button>
  );
}

/** Partner List table. Total Referred Orders is real (Order Attribution,
 * partner_id). Total Compensation / Outstanding Compensation display a
 * fixed 0 — Compensation Module has no implementation anywhere yet
 * (Product Owner Revision 2026-07-31, Decision 2 applies the same "0, not
 * blocked" treatment used on Partner Detail's Compensation Summary). */
export default function PartnerTable({ partners, referredOrderCounts, isLoading = false, sortKey, sortDir, onSort }: Props) {
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin text-2xl">⟳</div>
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <div className="bg-card rounded-xl p-12 text-center border border-border">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
          <Handshake className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-muted-foreground text-sm">Chưa có đối tác nào</p>
      </div>
    );
  }

  return (
    <>
      {/* Phase 3E-3: Compact Row + Detail (Product Owner Decision) - mobile
       * gets one card per partner instead of the 10-column table; every
       * card links to the same /partners/[id] Detail route the table's
       * code cell already uses. Referred-order count is real (Order
       * Attribution, same referredOrderCounts prop the desktop table
       * already reads) - the two Compensation columns are intentionally
       * left off the card since they're a fixed 0 placeholder (Product
       * Owner Revision 2026-07-31, Decision 2), not real data, same
       * precedent as omitting Sales Ledger's always-blank Order Number. */}
      <div className="lg:hidden space-y-3">
        {partners.map((partner) => (
          <Link
            key={partner.id}
            href={`/partners/${partner.id}`}
            data-testid="partner-mobile-row"
            className="block bg-card rounded-xl border border-border shadow-sm p-4 active:bg-muted/30 transition-colors touch-manipulation"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-foreground text-sm truncate">{partner.name}</p>
                <p className="text-xs text-muted-foreground">{partner.partner_code}</p>
              </div>
              <Badge variant={STATUS_BADGE_VARIANT[partner.status] ?? "muted"}>{partnerStatusLabel(partner.status)}</Badge>
            </div>

            <div className="flex items-center justify-between gap-3 text-sm mt-2.5">
              <span className="text-muted-foreground">{partnerTypeLabel(partner.partner_type)}</span>
              {partner.phone && <span className="text-muted-foreground">{partner.phone}</span>}
            </div>

            <div className="mt-2.5 pt-2.5 border-t border-border text-sm text-muted-foreground">
              {referredOrderCounts.get(partner.id) ?? 0} đơn giới thiệu
            </div>
          </Link>
        ))}
      </div>

      <div className="hidden lg:block overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table data-testid="partner-table" className="w-full min-w-[1400px]">
        <thead>
          <tr className="border-b border-border">
            <th className="px-5 py-3.5 text-left">Mã đối tác</th>
            <th className="px-5 py-3.5 text-left">
              <SortHeader label="Tên" sortKeyValue="name" activeSortKey={sortKey} activeSortDir={sortDir} onSort={onSort} />
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Loại đối tác
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Điện thoại
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Email
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Trạng thái
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tổng đơn giới thiệu
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Tổng hoa hồng
            </th>
            <th className="px-5 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Hoa hồng chưa thanh toán
            </th>
            <th className="px-5 py-3.5 text-left">
              <SortHeader label="Ngày tạo" sortKeyValue="created_at" activeSortKey={sortKey} activeSortDir={sortDir} onSort={onSort} />
            </th>
          </tr>
        </thead>
        <tbody>
          {partners.map((partner) => (
            <tr key={partner.id} className="border-b border-border last:border-0 hover:bg-muted/30">
              <td className="px-5 py-3.5 text-sm font-medium">
                <Link href={`/partners/${partner.id}`} className="text-primary hover:underline" data-testid="partner-row-link">
                  {partner.partner_code}
                </Link>
              </td>
              <td className="px-5 py-3.5 text-sm font-medium text-foreground">{partner.name}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{partnerTypeLabel(partner.partner_type)}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{partner.phone || "—"}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{partner.email || "—"}</td>
              <td className="px-5 py-3.5 text-sm">
                <Badge variant={STATUS_BADGE_VARIANT[partner.status] ?? "muted"}>{partnerStatusLabel(partner.status)}</Badge>
              </td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{referredOrderCounts.get(partner.id) ?? 0}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{currency.format(0)}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{currency.format(0)}</td>
              <td className="px-5 py-3.5 text-sm text-muted-foreground">{partner.created_at ? formatDate(partner.created_at) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}
