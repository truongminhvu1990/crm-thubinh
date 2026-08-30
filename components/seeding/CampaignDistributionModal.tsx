"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import {
  SeedingCampaignTargetWithPost,
  SeedingExecutionAccount,
  SeedingDestination,
  SeedingDistributionPreviewResult,
  SeedingDistributionConfirmResult,
} from "@/types/seeding";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { resolveTargetDisplayText } from "@/lib/seeding/seeding.constants";

/** Phase 2K-S — the one UI entry point for the Phase 2K distribution
 * feature: select execution accounts + destinations for a single campaign
 * target, preview the proposed round-robin assignment (zero writes, via
 * the existing distribution preview API), then explicitly confirm (via
 * the existing distribution confirm API). This component owns no
 * distribution logic itself — every assignment/duplicate/inactive-
 * exclusion decision is computed server-side by the already-verified
 * Phase 2K-E backend; this is presentation and the two existing API calls
 * only. Preview and Confirm always resubmit the same selection ids, never
 * a client-computed assignment — matching the locked "server always
 * recomputes" architecture exactly. */

interface Props {
  campaignId: string;
  target: SeedingCampaignTargetWithPost;
  onClose: () => void;
  onConfirmed: () => void | Promise<void>;
}

function sourceTypeLabel(sourceType: "Page" | "Personal" | "Group") {
  if (sourceType === "Page") return "Page";
  if (sourceType === "Personal") return "Cá nhân";
  return "Nhóm";
}

export default function CampaignDistributionModal({ campaignId, target, onClose, onConfirmed }: Props) {
  const [accounts, setAccounts] = useState<SeedingExecutionAccount[]>([]);
  const [destinations, setDestinations] = useState<SeedingDestination[]>([]);
  const [isLoadingResources, setIsLoadingResources] = useState(true);
  const staffOptions = useStaffOptions();

  function responsibleStaffLabel(executionAccountId: string): string {
    const account = accounts.find((a) => a.id === executionAccountId);
    if (!account?.assigned_staff_id) return "Chưa gán nhân viên";
    return staffOptions.find((s) => s.value === account.assigned_staff_id)?.label ?? "Chưa gán nhân viên";
  }

  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<SeedingDistributionPreviewResult | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [confirmResult, setConfirmResult] = useState<SeedingDistributionConfirmResult | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingResources(true);
      try {
        const [accountsRes, destinationsRes] = await Promise.all([
          fetch("/api/seeding/execution-accounts"),
          fetch("/api/seeding/destinations"),
        ]);
        if (accountsRes.ok) setAccounts(await accountsRes.json());
        if (destinationsRes.ok) setDestinations(await destinationsRes.json());
      } catch (error) {
        console.error("Failed to load execution accounts/destinations:", error);
      } finally {
        setIsLoadingResources(false);
      }
    })();
  }, []);

  function toggleAccount(id: string) {
    setPreview(null);
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDestination(id: string) {
    setPreview(null);
    setSelectedDestinationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handlePreview() {
    setIsPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    setConfirmResult(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${campaignId}/distribution/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_target_id: target.id,
          destination_ids: [...selectedDestinationIds],
          execution_account_ids: [...selectedAccountIds],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể xem trước phân phối");
      setPreview(await res.json());
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Không thể xem trước phân phối");
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleConfirm() {
    if (!preview || !preview.confirmAllowed) return;
    setIsConfirming(true);
    setConfirmError(null);
    try {
      const res = await fetch(`/api/seeding/campaigns/${campaignId}/distribution/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_target_id: target.id,
          destination_ids: [...selectedDestinationIds],
          execution_account_ids: [...selectedAccountIds],
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể xác nhận phân phối");
      const result: SeedingDistributionConfirmResult = await res.json();
      setConfirmResult(result);
      await onConfirmed();
    } catch (error) {
      setConfirmError(error instanceof Error ? error.message : "Không thể xác nhận phân phối");
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <Modal open title="Phân phối task" onClose={onClose} size="xl">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Phân phối bài viết này tới nhiều điểm đến (Nhóm Facebook), mỗi điểm đến gán cho một tài khoản thực hiện theo
          vòng (round-robin). CRM chỉ lên kế hoạch — nhân viên tự thực hiện thao tác trên Facebook.
        </p>
        <p className="text-sm text-foreground line-clamp-2 rounded-lg border border-border bg-muted/40 p-2">
          {resolveTargetDisplayText(target)}
        </p>

        {isLoadingResources ? (
          <p className="text-sm text-muted-foreground">Đang tải danh sách tài khoản / điểm đến...</p>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium text-foreground mb-1.5">Tài khoản thực hiện</p>
              {accounts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Chưa có tài khoản thực hiện nào — thêm tại Semi Seeding → Thiết lập thực hiện.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {accounts.map((a) => (
                    <label
                      key={a.id}
                      className={`flex items-center gap-2 text-sm ${a.status !== "Active" ? "opacity-50" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        disabled={a.status !== "Active"}
                        checked={selectedAccountIds.has(a.id)}
                        onChange={() => toggleAccount(a.id)}
                      />
                      {a.display_name}
                      <span className="text-xs text-muted-foreground">— {responsibleStaffLabel(a.id)}</span>
                      {a.status !== "Active" && <Badge variant="muted">Ngừng hoạt động</Badge>}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-foreground mb-1.5">Điểm đến (Nhóm Facebook)</p>
              {destinations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Chưa có điểm đến nào — thêm tại Semi Seeding → Thiết lập thực hiện.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {destinations.map((d) => (
                    <label
                      key={d.id}
                      className={`flex items-center gap-2 text-sm ${d.status !== "Active" ? "opacity-50" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4"
                        disabled={d.status !== "Active"}
                        checked={selectedDestinationIds.has(d.id)}
                        onChange={() => toggleDestination(d.id)}
                      />
                      {d.label}
                      {d.status !== "Active" && <Badge variant="muted">Ngừng hoạt động</Badge>}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {!preview && (
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handlePreview}
              isLoading={isPreviewing}
              disabled={selectedAccountIds.size === 0 || selectedDestinationIds.size === 0}
            >
              Xem trước phân phối
            </Button>
          </div>
        )}
        {previewError && <p className="text-destructive text-sm">{previewError}</p>}

        {preview && !confirmResult && (
          <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm text-foreground">
              Đề xuất phân phối tới <strong>{preview.assignableCandidates}</strong> điểm đến — chưa tạo task nào, vui
              lòng xem lại trước khi xác nhận.
            </p>

            {preview.proposedAssignments.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-3">Điểm đến</th>
                      <th className="py-1.5 pr-3">Tài khoản thực hiện</th>
                      <th className="py-1.5 pr-3">Nhân viên phụ trách</th>
                      <th className="py-1.5 pr-3">Nguồn</th>
                      <th className="py-1.5 pr-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.proposedAssignments.map((a) => (
                      <tr key={a.destination_id} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3 text-foreground">{a.destination_label}</td>
                        <td className="py-1.5 pr-3 text-foreground">{a.execution_account_label}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{responsibleStaffLabel(a.execution_account_id)}</td>
                        <td className="py-1.5 pr-3">
                          <Badge variant="muted">{sourceTypeLabel(a.source_type)}</Badge>
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.already_exists && <Badge variant="warning">Đã có task</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.unavailableDestinations.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium">Điểm đến không khả dụng:</p>
                <ul className="list-disc pl-4">
                  {preview.unavailableDestinations.map((u, i) => (
                    <li key={i}>{u.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.unavailableAccounts.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="font-medium">Tài khoản không khả dụng:</p>
                <ul className="list-disc pl-4">
                  {preview.unavailableAccounts.map((u, i) => (
                    <li key={i}>{u.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div className="text-xs text-amber-700">
                {preview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {!preview.confirmAllowed && (
              <p className="text-sm text-destructive">Không thể xác nhận — chưa đủ tài khoản/điểm đến đang hoạt động.</p>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>
                Xem lại lựa chọn
              </Button>
              <Button size="sm" onClick={handleConfirm} isLoading={isConfirming} disabled={!preview.confirmAllowed}>
                <Send className="w-4 h-4" /> Xác nhận phân phối
              </Button>
            </div>
          </div>
        )}
        {confirmError && <p className="text-destructive text-sm">{confirmError}</p>}

        {confirmResult && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-sm text-foreground">
              Đã tạo <strong>{confirmResult.created.length}</strong> task
              {confirmResult.skipped.length > 0 ? ` · bỏ qua ${confirmResult.skipped.length} (đã có task giống hệt)` : ""}
              {confirmResult.failed.length > 0 ? ` · lỗi ${confirmResult.failed.length}` : ""}
            </p>
            {confirmResult.failed.length > 0 && (
              <ul className="text-xs text-destructive list-disc pl-4">
                {confirmResult.failed.map((f, i) => (
                  <li key={i}>{f.reason}</li>
                ))}
              </ul>
            )}
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={onClose}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
