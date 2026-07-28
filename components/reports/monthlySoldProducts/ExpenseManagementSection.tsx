"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { OperatingExpense } from "@/types/operatingExpenses";
import { currency } from "@/lib/reports/format";
import { formatDate } from "@/lib/utils";
import Button from "@/components/ui/Button";
import AlertDialog from "@/components/ui/AlertDialog";
import ExpenseFormModal, { EXPENSE_CATEGORY_LABELS } from "./ExpenseFormModal";
import FinancialSummaryPanel from "./FinancialSummaryPanel";

interface DateRangeFilters {
  dateFrom?: string;
  dateTo?: string;
  month?: string;
}

interface Props {
  filters: DateRangeFilters;
  /** Reused as-is from the main report summary - see FinancialSummaryPanel. */
  revenue: number;
  cogs: number | null;
  /** Same Owner/Manager-only gate as this report's Gross Profit column -
   * both figures are cost-derived, `null` here means the viewer can't see
   * them, not that they're zero. */
  profitLoss: number | null;
  profitMargin: number | null;
  /** Owner = Full Access, Manager = Create/Edit/Delete, Staff = View only
   * (Product Owner Decision, Expense Management, 2026-07-28). */
  canManage: boolean;
  /** Operating Expenses feeds directly into the main report's Profit/Loss
   * formula (Total Revenue - Product Cost - Operating Expenses) - called
   * after every successful create/edit/delete so the parent's summary (and
   * this section's own profitLoss/profitMargin props, both sourced from
   * that same summary) don't go stale the moment an expense changes. */
  onExpensesChanged: () => void;
}

function buildQuery(filters: DateRangeFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.month) params.set("month", filters.month);
  return params.toString();
}

/** Expense Management (Product Owner Decision, 2026-07-28) - a simple,
 * lightweight section sharing the report's own date range filter ("Expenses
 * are filtered by the same date range as the report"). Deliberately no
 * filters/search/pagination of its own beyond the shared date range - "Do
 * not over-design this module. Keep it lightweight and operational." */
export default function ExpenseManagementSection({
  filters,
  revenue,
  cogs,
  profitLoss,
  profitMargin,
  canManage,
  onExpensesChanged,
}: Props) {
  const [rows, setRows] = useState<OperatingExpense[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OperatingExpense | null>(null);
  const [deleting, setDeleting] = useState<OperatingExpense | null>(null);

  async function load() {
    setIsLoading(true);
    const res = await fetch(`/api/reports/operating-expenses?${buildQuery(filters)}`);
    const data: { rows: OperatingExpense[]; total: number } = res.ok
      ? await res.json()
      : { rows: [], total: 0 };
    setRows(data.rows);
    setTotal(data.total);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters)]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(expense: OperatingExpense) {
    setEditing(expense);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleting) return;
    await fetch(`/api/reports/operating-expenses/${deleting.id}`, { method: "DELETE" });
    setDeleting(null);
    load();
    onExpensesChanged();
  }

  const columnCount = canManage ? 6 : 5;

  return (
    <div className="space-y-4 mt-8 print:hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-foreground">Quản lý chi phí vận hành</h2>
        {canManage && (
          <Button data-testid="expense-add-button" size="sm" onClick={openCreate}>
            <Plus className="w-3.5 h-3.5" />
            Thêm chi phí
          </Button>
        )}
      </div>

      <FinancialSummaryPanel
        revenue={revenue}
        cogs={cogs}
        operatingExpenses={total}
        profitLoss={profitLoss}
        profitMargin={profitMargin}
      />

      <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
        <table data-testid="expense-management-table" className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-border">
              {["Ngày chi phí", "Danh mục", "Mô tả", "Số tiền", "Người tạo"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
              {canManage && (
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Thao tác
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-muted-foreground">
                  Đang tải...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="px-4 py-8 text-center text-muted-foreground">
                  Chưa có chi phí nào trong khoảng thời gian này
                </td>
              </tr>
            ) : (
              rows.map((expense) => (
                <tr key={expense.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(expense.expense_date)}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                    {EXPENSE_CATEGORY_LABELS[expense.category]}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-muted-foreground">{expense.description || "—"}</td>
                  <td className="px-4 py-3.5 text-sm text-foreground whitespace-nowrap">
                    {currency.format(expense.amount)}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                    {expense.created_by_name || "—"}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <button
                          data-testid={`expense-edit-button-${expense.id}`}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => openEdit(expense)}
                          aria-label="Sửa chi phí"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          data-testid={`expense-delete-button-${expense.id}`}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          onClick={() => setDeleting(expense)}
                          aria-label="Xóa chi phí"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <ExpenseFormModal
          expense={editing}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            load();
            onExpensesChanged();
          }}
        />
      )}

      <AlertDialog
        open={!!deleting}
        title="Xóa chi phí"
        description="Bạn có chắc muốn xóa chi phí này? Hành động này không thể hoàn tác."
        onConfirm={confirmDelete}
        onOpenChange={(open) => !open && setDeleting(null)}
        testId="expense-delete-dialog"
      />
    </div>
  );
}
