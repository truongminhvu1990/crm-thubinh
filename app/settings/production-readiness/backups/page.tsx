"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { extractRestoreResult } from "@/lib/opsConsole/opsConsole.service";
import { ENVIRONMENTS } from "@/lib/opsConsole/opsConsole.constants";
import { formatRelativeTime } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";

const ENV_OPTIONS = ENVIRONMENTS.filter((e) => e.projectRef).map((e) => ({ value: e.label, label: e.label }));
const RESULT_OPTIONS = [
  { value: "success", label: "Thành công" },
  { value: "failure", label: "Thất bại" },
];

/** Backup Status (PRODUCTION_READINESS_UI.md §4, DB §6) + Restore History
 * (§5, DB §7, Decision 28) - reuses activity_logs. Decision 27: every
 * field here is operational metadata only (plan tier, PITR flag,
 * retention, backup reference as a label) - never business/customer data,
 * by construction (no such field exists to send). Decision 35: desktop-
 * only write actions. */
export default function BackupRestoreStatusPage() {
  const [backups, setBackups] = useState<ActivityLog[]>([]);
  const [restores, setRestores] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [bkEnv, setBkEnv] = useState<string>(ENV_OPTIONS[1]?.value || "");
  const [bkPlan, setBkPlan] = useState("");
  const [bkPitr, setBkPitr] = useState(false);
  const [bkRetention, setBkRetention] = useState("");
  const [bkNotes, setBkNotes] = useState("");

  const [rdEnv, setRdEnv] = useState<string>(ENV_OPTIONS[1]?.value || "");
  const [rdRef, setRdRef] = useState("");
  const [rdDuration, setRdDuration] = useState("");
  const [rdResult, setRdResult] = useState<"success" | "failure">("success");
  const [rdNotes, setRdNotes] = useState("");

  async function load() {
    setIsLoading(true);
    const [b, r] = await Promise.all([opsApi.getBackupConfirmations(), opsApi.getRestoreDrills()]);
    setBackups(b);
    setRestores(r);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConfirmBackup() {
    if (!bkEnv || !bkPlan.trim()) return;
    await opsApi.logBackupConfirmation({
      environment: bkEnv,
      plan_tier: bkPlan.trim(),
      pitr_enabled: bkPitr,
      retention_days: bkRetention ? Number(bkRetention) : undefined,
      notes: bkNotes.trim() || undefined,
    });
    setBkPlan("");
    setBkRetention("");
    setBkNotes("");
    await load();
  }

  async function handleLogRestore() {
    if (!rdEnv || !rdRef.trim() || !rdDuration.trim()) return;
    await opsApi.logRestoreDrill({
      environment: rdEnv,
      backup_reference: rdRef.trim(),
      restore_duration: rdDuration.trim(),
      result: rdResult,
      notes: rdNotes.trim() || undefined,
    });
    setRdRef("");
    setRdDuration("");
    setRdNotes("");
    await load();
  }

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Sao lưu &amp; Khôi phục</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Chỉ lưu siêu dữ liệu vận hành (operational metadata) — không bao giờ chứa dữ liệu khách hàng/kinh doanh (Decision 27)
      </p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-foreground mb-3">Trạng thái sao lưu</h2>

          <div className="hidden md:block mb-4">
            <Card>
              <div className="space-y-3">
                <Select label="Môi trường" options={ENV_OPTIONS} value={bkEnv} onChange={(e) => setBkEnv(e.target.value)} />
                <Input label="Gói dịch vụ (plan tier)" value={bkPlan} onChange={(e) => setBkPlan(e.target.value)} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={bkPitr} onChange={(e) => setBkPitr(e.target.checked)} /> PITR đã bật
                </label>
                <Input label="Số ngày lưu trữ (nếu có)" type="number" value={bkRetention} onChange={(e) => setBkRetention(e.target.value)} />
                <Input label="Ghi chú" value={bkNotes} onChange={(e) => setBkNotes(e.target.value)} />
                <Button variant="primary" size="sm" onClick={handleConfirmBackup}>
                  <Plus className="w-4 h-4" />
                  Xác nhận backup
                </Button>
              </div>
            </Card>
          </div>
          <p className="md:hidden text-xs text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            Chỉ thực hiện trên máy tính (Desktop only).
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : backups.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted-foreground text-sm">Chưa xác nhận (Chưa có bản ghi)</p>
            </Card>
          ) : (
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {backups.map((b) => (
                <div key={b.id} className="px-4 py-3">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{b.entity_id}</span> — {b.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.staff?.full_name || "—"} · {formatRelativeTime(b.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-foreground mb-3">Lịch sử khôi phục (Restore Drill)</h2>

          <div className="hidden md:block mb-4">
            <Card>
              <div className="space-y-3">
                <Select label="Môi trường" options={ENV_OPTIONS} value={rdEnv} onChange={(e) => setRdEnv(e.target.value)} />
                <Input label="Backup reference" value={rdRef} onChange={(e) => setRdRef(e.target.value)} />
                <Input label="Thời gian khôi phục (Restore duration)" placeholder="VD: 42 phút" value={rdDuration} onChange={(e) => setRdDuration(e.target.value)} />
                <Select label="Kết quả (Result)" options={RESULT_OPTIONS} value={rdResult} onChange={(e) => setRdResult(e.target.value as "success" | "failure")} />
                <Input label="Ghi chú (Notes)" value={rdNotes} onChange={(e) => setRdNotes(e.target.value)} />
                <Button variant="primary" size="sm" onClick={handleLogRestore}>
                  <Plus className="w-4 h-4" />
                  Ghi nhận restore drill
                </Button>
              </div>
            </Card>
          </div>
          <p className="md:hidden text-xs text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            Chỉ thực hiện trên máy tính (Desktop only).
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : restores.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted-foreground text-sm">Chưa có restore drill nào</p>
            </Card>
          ) : (
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {restores.map((r) => {
                const failed = extractRestoreResult(r.action) === "failure";
                return (
                  <div key={r.id} className={`px-4 py-3 ${failed ? "bg-destructive/5" : ""}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{r.entity_id}</span>
                      <Badge variant={failed ? "destructive" : "success"}>{failed ? "Thất bại" : "Thành công"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Operator: {r.staff?.full_name || "—"} · {formatRelativeTime(r.created_at)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{r.action}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
