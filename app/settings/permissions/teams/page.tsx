"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, UsersRound, X, Pencil } from "lucide-react";
import { Staff } from "@/types/staff";
import { TeamSummary } from "@/types/permissionCenter";
import { getStaffByTeam, getUnassignedStaff } from "@/lib/permission/permissionCenter.repository";
import { getStaffList } from "@/lib/staff.service";
import { permissionApi } from "@/lib/permission/permissionCenterApi";
import PermissionTabs from "@/components/permission/PermissionTabs";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Avatar from "@/components/ui/Avatar";
import AlertDialog from "@/components/ui/AlertDialog";

/** Team Management (Decision 13, PERMISSION_UI.md §7) - staff.team_id is a
 * plain, ungoverned text value with no backing table (DB Self Review); this
 * screen is the sole place a new team name can be typed - every other
 * picker in the section is closed-list only. */
export default function TeamManagementPage() {
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [members, setMembers] = useState<Record<string, Staff[]>>({});
  const [unassigned, setUnassigned] = useState<Staff[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newTeamName, setNewTeamName] = useState("");
  const [pendingNewTeams, setPendingNewTeams] = useState<string[]>([]);
  const [renaming, setRenaming] = useState<{ team_id: string; value: string } | null>(null);
  const [renameConfirm, setRenameConfirm] = useState<{ old: string; next: string } | null>(null);
  const [addingTo, setAddingTo] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    const [teamList, unassignedStaff, staffList] = await Promise.all([
      permissionApi.getTeams(),
      getUnassignedStaff(),
      getStaffList(),
    ]);
    setTeams(teamList);
    setUnassigned(unassignedStaff);
    setAllStaff(staffList);
    setPendingNewTeams((prev) => prev.filter((t) => !teamList.some((tt) => tt.team_id === t)));
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleExpand(teamId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    if (!members[teamId]) {
      const staff = await getStaffByTeam(teamId);
      setMembers((prev) => ({ ...prev, [teamId]: staff }));
    }
  }

  function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    if (teams.some((t) => t.team_id === name) || pendingNewTeams.includes(name)) {
      setNewTeamName("");
      return;
    }
    setPendingNewTeams((prev) => [...prev, name]);
    setNewTeamName("");
  }

  async function handleAssign(teamId: string, staffId: string, isNewTeam: boolean) {
    await permissionApi.assignTeam([staffId], teamId, isNewTeam);
    await load();
    const staff = await getStaffByTeam(teamId);
    setMembers((prev) => ({ ...prev, [teamId]: staff }));
    setAddingTo((prev) => ({ ...prev, [teamId]: "" }));
  }

  async function handleRemove(teamId: string, staffId: string) {
    await permissionApi.assignTeam([staffId], null);
    await load();
    const staff = await getStaffByTeam(teamId);
    setMembers((prev) => ({ ...prev, [teamId]: staff }));
  }

  async function confirmRename() {
    if (!renameConfirm) return;
    await permissionApi.renameTeam(renameConfirm.old, renameConfirm.next);
    setRenameConfirm(null);
    setRenaming(null);
    setMembers({});
    await load();
  }

  const knownTeamIds = new Set([...teams.map((t) => t.team_id), ...pendingNewTeams]);

  return (
    <div className="pb-8">
      <Link href="/settings/permissions" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Nhóm</h1>
      <p className="text-muted-foreground mb-6 text-sm">{knownTeamIds.size} nhóm</p>

      <PermissionTabs />

      <div className="mb-6 flex gap-2 max-w-md">
        <Input placeholder="Tên nhóm mới..." value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
        <Button variant="primary" onClick={handleCreateTeam}>
          <Plus className="w-4 h-4" />
          Tạo nhóm
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin text-2xl">⟳</div>
        </div>
      ) : knownTeamIds.size === 0 ? (
        <Card className="text-center py-12">
          <p className="text-muted-foreground text-sm">Chưa có nhóm nào được tạo</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {[...teams.map((t) => t.team_id), ...pendingNewTeams].map((teamId) => {
            const summary = teams.find((t) => t.team_id === teamId);
            const isPending = !summary;
            const isExpanded = expanded.has(teamId);
            const teamMembers = members[teamId] || [];
            const eligibleToAdd = allStaff.filter((s) => s.team_id !== teamId);

            return (
              <Card key={teamId}>
                <div className="flex items-center justify-between gap-3">
                  <button className="flex items-center gap-2 text-left" onClick={() => toggleExpand(teamId)}>
                    <UsersRound className="w-4 h-4 text-primary" />
                    {renaming?.team_id === teamId ? (
                      <Input
                        value={renaming.value}
                        onChange={(e) => setRenaming({ team_id: teamId, value: e.target.value })}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="font-medium text-foreground">
                        {teamId} {isPending && <span className="text-xs text-muted-foreground">(mới, chưa có thành viên)</span>}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{summary?.member_count ?? 0} thành viên</span>
                    {!isPending &&
                      (renaming?.team_id === teamId ? (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => setRenameConfirm({ old: teamId, next: renaming.value.trim() })}
                          disabled={!renaming.value.trim() || renaming.value.trim() === teamId}
                        >
                          Lưu
                        </Button>
                      ) : (
                        <button
                          className="p-1.5 hover:bg-muted rounded-md"
                          onClick={() => setRenaming({ team_id: teamId, value: teamId })}
                          aria-label="Đổi tên nhóm"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                      ))}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-border space-y-2">
                    {teamMembers.length === 0 && <p className="text-xs text-muted-foreground">Chưa có thành viên</p>}
                    {teamMembers.map((s) => (
                      <div key={s.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar name={s.full_name} size="sm" />
                          <span className="text-sm text-foreground">{s.full_name}</span>
                        </div>
                        <button onClick={() => handleRemove(teamId, s.id)} aria-label={`Gỡ ${s.full_name} khỏi nhóm`}>
                          <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2 pt-2">
                      <Select
                        placeholder="Thêm nhân viên..."
                        value={addingTo[teamId] || ""}
                        onChange={(e) => setAddingTo((prev) => ({ ...prev, [teamId]: e.target.value }))}
                        options={eligibleToAdd.map((s) => ({ value: s.id, label: s.full_name }))}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!addingTo[teamId]}
                        onClick={() => handleAssign(teamId, addingTo[teamId], isPending)}
                      >
                        Thêm
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mt-8">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Chưa có nhóm</p>
          <Card>
            <div className="space-y-2">
              {unassigned.map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Avatar name={s.full_name} size="sm" />
                  <span className="text-sm text-foreground">{s.full_name}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <AlertDialog
        open={!!renameConfirm}
        title="Đổi tên nhóm?"
        description={
          renameConfirm
            ? `${teams.find((t) => t.team_id === renameConfirm.old)?.member_count ?? 0} nhân viên sẽ được chuyển từ "${renameConfirm.old}" sang "${renameConfirm.next}". Nếu "${renameConfirm.next}" trùng với một nhóm đã tồn tại, hai nhóm sẽ gộp lại.`
            : undefined
        }
        confirmLabel="Đổi tên"
        confirmVariant="primary"
        onOpenChange={(open) => !open && setRenameConfirm(null)}
        onConfirm={confirmRename}
      />
    </div>
  );
}
