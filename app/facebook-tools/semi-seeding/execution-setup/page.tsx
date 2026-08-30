"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserCog, MapPinned, Plus, AlertTriangle, Link2, Eye } from "lucide-react";
import {
  SeedingExecutionAccount,
  SeedingExecutionAccountWithStats,
  SeedingExecutionAccountDetail,
  SeedingPageAccountWithStats,
  SeedingDirectCommentCapability,
  SeedingTaskCounts,
  SeedingDestination,
  SeedingDestinationWithTaskCount,
  CreateSeedingExecutionAccountInput,
  UpdateSeedingExecutionAccountInput,
  CreateSeedingDestinationInput,
  UpdateSeedingDestinationInput,
} from "@/types/seeding";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useStaffOptions } from "@/lib/hooks/useStaffOptions";
import { seedingTaskStatusLabel, seedingTaskActionTypeLabel } from "@/lib/seeding/seeding.constants";

/** Facebook Tools → Semi Seeding → Execution Setup (Phase 2K-E, extended
 * 2K-BO as the Seeding Account Center). Manages the resource pools
 * distribution draws from — real Facebook identities staff manually
 * operate (seeding_execution_accounts) and Groups work can be
 * distributed into (seeding_destinations) — and, since 2K-BO, shows
 * both account "types" the business actually has with their real,
 * server-computed Direct Comment capability side by side: Execution
 * Accounts (always NOT_SUPPORTED — no credential is ever stored for
 * them) and connected Facebook Pages (AVAILABLE/UNAVAILABLE, from their
 * real OAuth connection health). No credentials are ever collected
 * here — this page only records a display name and, for a destination,
 * a Group URL to identify it by; no password/session/token field exists
 * anywhere in this module. */

function statusBadge(status: string) {
  return status === "Active" ? <Badge variant="success">Đang hoạt động</Badge> : <Badge variant="muted">Ngừng hoạt động</Badge>;
}

/** Phase 2K-BO — renders exactly what the server returned, never a
 * client-side guess: AVAILABLE/UNAVAILABLE/NOT_SUPPORTED all come
 * straight from lib/seeding/seedingAccountCenter.service.ts's own
 * capability computation. */
function capabilityBadge(capability: SeedingDirectCommentCapability) {
  if (capability.availability === "AVAILABLE") return <Badge variant="success">Đăng trực tiếp: Khả dụng</Badge>;
  const label = capability.availability === "NOT_SUPPORTED" ? "Không hỗ trợ" : "Chưa khả dụng";
  return (
    <div className="space-y-0.5">
      <Badge variant="muted">Đăng trực tiếp: {label}</Badge>
      {capability.reason && <p className="text-[11px] text-muted-foreground max-w-[240px]">{capability.reason}</p>}
    </div>
  );
}

function taskStatusBadgeSmall(status: string) {
  const label = seedingTaskStatusLabel(status);
  if (status === "Done") return <Badge variant="success">{label}</Badge>;
  if (status === "Failed") return <Badge variant="destructive">{label}</Badge>;
  if (status === "In Progress") return <Badge variant="default">{label}</Badge>;
  if (status === "Skipped" || status === "Cancelled") return <Badge variant="muted">{label}</Badge>;
  return <Badge variant="warning">{label}</Badge>;
}

function taskCountsSummary(counts: SeedingTaskCounts) {
  if (counts.total === 0) return <span className="text-xs text-muted-foreground">Chưa có task</span>;
  return (
    <div className="flex flex-wrap gap-1 text-[11px]">
      {counts.pending > 0 && <Badge variant="warning">{counts.pending} Chờ xử lý</Badge>}
      {counts.inProgress > 0 && <Badge variant="default">{counts.inProgress} Đang thực hiện</Badge>}
      {counts.done > 0 && <Badge variant="success">{counts.done} Đã xong</Badge>}
      {counts.failed > 0 && <Badge variant="destructive">{counts.failed} Thất bại</Badge>}
    </div>
  );
}

export default function SeedingExecutionSetupPage() {
  const [forbidden, setForbidden] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [accounts, setAccounts] = useState<SeedingExecutionAccountWithStats[]>([]);
  // Phase 2K-BO — the other account "type": connected Facebook Pages,
  // shown side by side with Execution Accounts so staff see both real
  // Direct Comment-capable identities and manual-only ones in one place.
  const [pages, setPages] = useState<SeedingPageAccountWithStats[]>([]);
  const [destinations, setDestinations] = useState<SeedingDestinationWithTaskCount[]>([]);
  const staffOptions = useStaffOptions();

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SeedingExecutionAccount | null>(null);
  const [accountDisplayName, setAccountDisplayName] = useState("");
  const [accountNotes, setAccountNotes] = useState("");
  const [accountAssignedStaffId, setAccountAssignedStaffId] = useState("");
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Phase 2K-BO — Account Center detail view (4B): fetched on demand per
  // click, not preloaded for every account in the list.
  const [accountDetail, setAccountDetail] = useState<SeedingExecutionAccountDetail | null>(null);
  const [isLoadingAccountDetail, setIsLoadingAccountDetail] = useState(false);

  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [editingDestination, setEditingDestination] = useState<SeedingDestination | null>(null);
  const [destinationLabel, setDestinationLabel] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [destinationNotes, setDestinationNotes] = useState("");
  const [isSavingDestination, setIsSavingDestination] = useState(false);
  const [destinationError, setDestinationError] = useState<string | null>(null);
  // Phase 2K-BY (P1 #7) — visible surface for actions with no dedicated
  // error slot of their own (page load, status toggles, detail load).
  const [actionError, setActionError] = useState<string | null>(null);

  async function loadAll() {
    setIsLoading(true);
    setForbidden(false);
    setActionError(null);
    try {
      const [accountCenterRes, destinationsRes] = await Promise.all([
        fetch("/api/seeding/account-center"),
        fetch("/api/seeding/destinations?includeTaskCounts=true"),
      ]);
      if (accountCenterRes.status === 403 || destinationsRes.status === 403) {
        setForbidden(true);
        return;
      }
      if (accountCenterRes.ok) {
        const overview = await accountCenterRes.json();
        setAccounts(overview.executionAccounts);
        setPages(overview.pages);
      }
      if (destinationsRes.ok) setDestinations(await destinationsRes.json());
    } catch (error) {
      console.error("Failed to load seeding execution setup:", error);
      setActionError("Không thể tải dữ liệu — vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function openCreateAccount() {
    setEditingAccount(null);
    setAccountDisplayName("");
    setAccountNotes("");
    setAccountAssignedStaffId("");
    setAccountError(null);
    setShowAccountModal(true);
  }

  function openEditAccount(account: SeedingExecutionAccount) {
    setEditingAccount(account);
    setAccountDisplayName(account.display_name);
    setAccountNotes(account.notes ?? "");
    setAccountAssignedStaffId(account.assigned_staff_id ?? "");
    setAccountError(null);
    setShowAccountModal(true);
  }

  async function handleSaveAccount() {
    setIsSavingAccount(true);
    setAccountError(null);
    try {
      if (editingAccount) {
        const input: UpdateSeedingExecutionAccountInput = {
          display_name: accountDisplayName,
          notes: accountNotes || null,
          assigned_staff_id: accountAssignedStaffId || null,
        };
        const res = await fetch(`/api/seeding/execution-accounts/${editingAccount.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể cập nhật tài khoản");
      } else {
        const input: CreateSeedingExecutionAccountInput = {
          display_name: accountDisplayName,
          notes: accountNotes || null,
          assigned_staff_id: accountAssignedStaffId || null,
        };
        const res = await fetch("/api/seeding/execution-accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo tài khoản");
      }
      setShowAccountModal(false);
      await loadAll();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : "Không thể lưu tài khoản");
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleToggleAccountStatus(account: SeedingExecutionAccount) {
    try {
      const nextStatus = account.status === "Active" ? "Inactive" : "Active";
      const res = await fetch(`/api/seeding/execution-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể đổi trạng thái tài khoản");
      await loadAll();
    } catch (error) {
      console.error("Failed to toggle execution account status:", error);
      setActionError(error instanceof Error ? error.message : "Không thể đổi trạng thái tài khoản");
    }
  }

  /** Phase 2K-BO — Account Center detail view (4B). Fetched fresh on
   * every open, never reused stale state from the list view — the
   * detail response's own task list/counts are the source of truth for
   * "recent execution status". */
  async function handleViewAccountDetail(accountId: string) {
    setIsLoadingAccountDetail(true);
    setAccountDetail(null);
    try {
      const res = await fetch(`/api/seeding/execution-accounts/${accountId}/detail`);
      if (!res.ok) throw new Error(await res.text());
      setAccountDetail(await res.json());
    } catch (error) {
      console.error("Failed to load execution account detail:", error);
      setActionError("Không thể tải chi tiết tài khoản — vui lòng thử lại.");
    } finally {
      setIsLoadingAccountDetail(false);
    }
  }

  function openCreateDestination() {
    setEditingDestination(null);
    setDestinationLabel("");
    setDestinationUrl("");
    setDestinationNotes("");
    setDestinationError(null);
    setShowDestinationModal(true);
  }

  function openEditDestination(destination: SeedingDestination) {
    setEditingDestination(destination);
    setDestinationLabel(destination.label);
    setDestinationUrl(destination.permalink_url);
    setDestinationNotes(destination.notes ?? "");
    setDestinationError(null);
    setShowDestinationModal(true);
  }

  async function handleSaveDestination() {
    setIsSavingDestination(true);
    setDestinationError(null);
    try {
      if (editingDestination) {
        const input: UpdateSeedingDestinationInput = {
          label: destinationLabel,
          permalink_url: destinationUrl,
          notes: destinationNotes || null,
        };
        const res = await fetch(`/api/seeding/destinations/${editingDestination.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể cập nhật điểm đến");
      } else {
        const input: CreateSeedingDestinationInput = { label: destinationLabel, permalink_url: destinationUrl, notes: destinationNotes || null };
        const res = await fetch("/api/seeding/destinations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể tạo điểm đến");
      }
      setShowDestinationModal(false);
      await loadAll();
    } catch (error) {
      setDestinationError(error instanceof Error ? error.message : "Không thể lưu điểm đến");
    } finally {
      setIsSavingDestination(false);
    }
  }

  async function handleToggleDestinationStatus(destination: SeedingDestination) {
    try {
      const nextStatus = destination.status === "Active" ? "Inactive" : "Active";
      const input: UpdateSeedingDestinationInput = { status: nextStatus };
      const res = await fetch(`/api/seeding/destinations/${destination.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Không thể đổi trạng thái điểm đến");
      await loadAll();
    } catch (error) {
      console.error("Failed to toggle destination status:", error);
      setActionError(error instanceof Error ? error.message : "Không thể đổi trạng thái điểm đến");
    }
  }

  if (forbidden) {
    return (
      <div className="p-6">
        <Card className="flex items-center gap-3 text-destructive">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <p className="text-sm">
            Bạn chưa được cấp quyền <code>seeding.manage</code>. Liên hệ Admin để được cấp quyền trong Cài đặt → Phân
            quyền.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {actionError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-destructive/70 hover:text-destructive text-xs">
            Đóng
          </button>
        </div>
      )}
      <Link href="/facebook-tools/semi-seeding" className="flex items-center gap-2 text-primary hover:text-primary/80 w-fit text-sm">
        <ArrowLeft className="w-4 h-4" /> Quay lại Semi Seeding
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-foreground">Thiết lập thực hiện Seeding</h1>
        {/* Phase 2K-CB (Issue 5) — the previous wording ("tài khoản Facebook
           thực hiện") implied both sections below are Facebook-connected,
           which is backwards for "Tài khoản thực hiện": it has no OAuth, no
           token, no Facebook API capability at all — pure task-assignment
           identity. Only "Facebook Page đã kết nối" is a real connection. */}
        <p className="text-sm text-muted-foreground">
          Quản lý 2 loại tài khoản và điểm đến (Nhóm) — dùng cho phân phối task thủ công:
        </p>
        <ul className="text-sm text-muted-foreground list-disc list-inside">
          <li>
            <strong className="text-foreground">Tài khoản thực hiện</strong> — định danh để giao việc thủ công, không
            kết nối Facebook, không có access token hay khả năng gọi API.
          </li>
          <li>
            <strong className="text-foreground">Facebook Page đã kết nối</strong> — Page thật đã xác thực (OAuth), có
            token thật, có thể đăng comment trực tiếp khi Meta cho phép.
          </li>
        </ul>
      </div>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <UserCog className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Tài khoản thực hiện</h2>
          </div>
          <Button size="sm" onClick={openCreateAccount}>
            <Plus className="w-4 h-4" /> Thêm tài khoản
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có tài khoản thực hiện nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Tên hiển thị</th>
                  <th className="py-2 pr-4">Loại</th>
                  <th className="py-2 pr-4">Nhân viên phụ trách</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  <th className="py-2 pr-4">Đăng comment trực tiếp</th>
                  <th className="py-2 pr-4">Số task</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-3 pr-4 text-foreground">{a.display_name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">Tài khoản thủ công</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {staffOptions.find((s) => s.value === a.assigned_staff_id)?.label ?? "Chưa gán nhân viên"}
                    </td>
                    <td className="py-3 pr-4">{statusBadge(a.status)}</td>
                    <td className="py-3 pr-4">{capabilityBadge(a.direct_comment_capability)}</td>
                    <td className="py-3 pr-4">{taskCountsSummary(a.task_counts)}</td>
                    <td className="py-3 pr-4 flex gap-2 justify-end flex-wrap">
                      <Button size="sm" variant="secondary" onClick={() => handleViewAccountDetail(a.id)}>
                        <Eye className="w-3.5 h-3.5" /> Chi tiết
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => openEditAccount(a)}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleToggleAccountStatus(a)}>
                        {a.status === "Active" ? "Ngừng hoạt động" : "Kích hoạt lại"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Phase 2K-BO — the other account "type": connected Facebook Pages.
         Read-only here (connecting/reconnecting a Page happens in Facebook
         Tools' own Page-connection flow, unchanged) — this section exists
         purely so staff can see, at a glance, which Pages can actually
         support Direct Comment right now and why not when they can't. */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Facebook Page đã kết nối</h2>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : pages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có Facebook Page nào được kết nối.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Tên Page</th>
                  <th className="py-2 pr-4">Loại</th>
                  <th className="py-2 pr-4">Trạng thái kết nối</th>
                  <th className="py-2 pr-4">Đăng comment trực tiếp</th>
                  <th className="py-2 pr-4">Số task</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.page.id} className="border-b border-border last:border-0 align-top">
                    <td className="py-3 pr-4 text-foreground">{p.page.page_name}</td>
                    <td className="py-3 pr-4 text-muted-foreground">Page</td>
                    <td className="py-3 pr-4">
                      {p.page.status === "Connected" ? (
                        <Badge variant="success">Đã kết nối</Badge>
                      ) : p.page.status === "Reconnect Required" ? (
                        <Badge variant="warning">Cần kết nối lại</Badge>
                      ) : (
                        <Badge variant="muted">Đã ngắt kết nối</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4">{capabilityBadge(p.direct_comment_capability)}</td>
                    <td className="py-3 pr-4">{taskCountsSummary(p.task_counts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
          <div className="flex items-center gap-2">
            <MapPinned className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Điểm đến (Nhóm Facebook)</h2>
          </div>
          <Button size="sm" onClick={openCreateDestination}>
            <Plus className="w-4 h-4" /> Thêm điểm đến
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : destinations.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có điểm đến nào.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4">Tên</th>
                  <th className="py-2 pr-4">Link Nhóm</th>
                  <th className="py-2 pr-4">Trạng thái</th>
                  {/* Phase 2K-BZ (P2 #5) — same "task đã dùng" concept
                     Execution Accounts' own table already shows,
                     matching this codebase's usual list-with-usage-count
                     convention (Account Center, Execution Accounts). */}
                  <th className="py-2 pr-4">Đã dùng</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {destinations.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="py-3 pr-4 text-foreground">{d.label}</td>
                    <td className="py-3 pr-4 text-muted-foreground truncate max-w-[220px]">
                      <a href={d.permalink_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {d.permalink_url}
                      </a>
                    </td>
                    <td className="py-3 pr-4">{statusBadge(d.status)}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{d.task_count} task</td>
                    <td className="py-3 pr-4 flex gap-2 justify-end">
                      <Button size="sm" variant="secondary" onClick={() => openEditDestination(d)}>
                        Sửa
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleToggleDestinationStatus(d)}>
                        {d.status === "Active" ? "Ngừng hoạt động" : "Kích hoạt lại"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={showAccountModal} title={editingAccount ? "Sửa tài khoản thực hiện" : "Thêm tài khoản thực hiện"} onClose={() => setShowAccountModal(false)}>
        <div className="space-y-4">
          <Input label="Tên hiển thị" value={accountDisplayName} onChange={(e) => setAccountDisplayName(e.target.value)} placeholder="VD: Nick Facebook A" />
          <Select
            label="Nhân viên phụ trách"
            placeholder="Chưa gán nhân viên"
            options={staffOptions}
            value={accountAssignedStaffId}
            onChange={(e) => setAccountAssignedStaffId(e.target.value)}
          />
          <Input label="Ghi chú (tuỳ chọn)" value={accountNotes} onChange={(e) => setAccountNotes(e.target.value)} placeholder="VD: Tài khoản chị Lan thường dùng" />
          {accountError && <p className="text-destructive text-sm">{accountError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowAccountModal(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveAccount} isLoading={isSavingAccount} disabled={!accountDisplayName.trim()}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showDestinationModal}
        title={editingDestination ? "Sửa điểm đến" : "Thêm điểm đến"}
        onClose={() => setShowDestinationModal(false)}
      >
        <div className="space-y-4">
          <Input label="Tên" value={destinationLabel} onChange={(e) => setDestinationLabel(e.target.value)} placeholder="VD: Hội yêu đá phong thủy" />
          <Input
            label="Link Nhóm Facebook"
            value={destinationUrl}
            onChange={(e) => setDestinationUrl(e.target.value)}
            placeholder="https://www.facebook.com/groups/..."
          />
          <Input label="Ghi chú (tuỳ chọn)" value={destinationNotes} onChange={(e) => setDestinationNotes(e.target.value)} />
          {destinationError && <p className="text-destructive text-sm">{destinationError}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowDestinationModal(false)}>
              Hủy
            </Button>
            <Button onClick={handleSaveDestination} isLoading={isSavingDestination} disabled={!destinationLabel.trim() || !destinationUrl.trim()}>
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* Phase 2K-BO — Account Center detail view (4B). Open state is
         driven purely by whether a detail fetch is in flight or has a
         result — no separate boolean, so there's no way for the modal to
         show stale data from a previously-viewed account. */}
      <Modal
        open={isLoadingAccountDetail || !!accountDetail}
        title={accountDetail ? `Chi tiết: ${accountDetail.display_name}` : "Đang tải..."}
        onClose={() => setAccountDetail(null)}
      >
        {isLoadingAccountDetail || !accountDetail ? (
          <p className="text-sm text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Trạng thái tài khoản</p>
                {statusBadge(accountDetail.status)}
              </div>
              <div>
                <p className="text-muted-foreground">Đăng comment trực tiếp</p>
                {capabilityBadge(accountDetail.direct_comment_capability)}
              </div>
              <div>
                <p className="text-muted-foreground">Nhân viên phụ trách</p>
                <p className="text-foreground">{staffOptions.find((s) => s.value === accountDetail.assigned_staff_id)?.label ?? "Chưa gán"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Tổng số task</p>
                <p className="text-foreground">{accountDetail.task_counts.total}</p>
              </div>
            </div>
            {accountDetail.notes && (
              <div className="text-sm">
                <p className="text-muted-foreground">Ghi chú</p>
                <p className="text-foreground">{accountDetail.notes}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-foreground mb-2">Task đã giao (mới nhất trước)</h3>
              {accountDetail.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có task nào được giao cho tài khoản này.</p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border sticky top-0 bg-card">
                        <th className="py-1.5 pr-3">Campaign</th>
                        <th className="py-1.5 pr-3">Hành động</th>
                        <th className="py-1.5 pr-3">Trạng thái</th>
                        <th className="py-1.5 pr-3">Cập nhật lúc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accountDetail.tasks.map((t) => (
                        <tr key={t.id} className="border-b border-border last:border-0">
                          {/* Phase 2K-BZ (P2 #2) — drill-through to the
                             task's own campaign, reusing the existing
                             Campaign Detail route; the real campaign
                             name is always shown, never the raw
                             campaign_id, and a legacy task with no
                             resolvable campaign shows an honest "—". */}
                          <td className="py-1.5 pr-3">
                            {t.campaign_name ? (
                              <a
                                href={`/facebook-tools/semi-seeding/${t.campaign_id}`}
                                className="text-primary hover:underline"
                              >
                                {t.campaign_name}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-foreground">{seedingTaskActionTypeLabel(t.action_type)}</td>
                          <td className="py-1.5 pr-3">{taskStatusBadgeSmall(t.status)}</td>
                          <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                            {t.updated_at ? new Date(t.updated_at).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" onClick={() => setAccountDetail(null)}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
