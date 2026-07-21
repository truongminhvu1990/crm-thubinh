"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { ActivityLog } from "@/types/activityLog";
import { opsApi } from "@/lib/opsConsole/opsConsoleApi";
import { ENVIRONMENTS } from "@/lib/opsConsole/opsConsole.constants";
import { formatRelativeTime } from "@/lib/utils";
import OpsConsoleTabs from "@/components/opsConsole/OpsConsoleTabs";
import EnvironmentBanner from "@/components/opsConsole/EnvironmentBanner";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";

const ENV_OPTIONS = ENVIRONMENTS.filter((e) => e.projectRef).map((e) => ({ value: e.label, label: e.label }));

/** Deployment History (PRODUCTION_READINESS_UI.md §3) + Migration History /
 * Migration Verification Checklist (§6, DB §3.1) - manually-entered logs,
 * reusing activity_logs (entity="deployment"/"migration", Decision 36).
 * Decision 35: the write actions on this page are desktop-only - on
 * mobile, history is still fully viewable, the log/verify forms are
 * replaced by a "Desktop only" note. */
export default function DeploymentMigrationHistoryPage() {
  const [deployments, setDeployments] = useState<ActivityLog[]>([]);
  const [migrations, setMigrations] = useState<ActivityLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [depEnv, setDepEnv] = useState<string>(ENV_OPTIONS[1]?.value || "");
  const [depVersion, setDepVersion] = useState("");
  const [depNotes, setDepNotes] = useState("");

  const [migEnv, setMigEnv] = useState<string>(ENV_OPTIONS[1]?.value || "");
  const [migFile, setMigFile] = useState("");
  const [migCompleted, setMigCompleted] = useState(false);
  const [migRecordCounts, setMigRecordCounts] = useState(false);
  const [migConstraints, setMigConstraints] = useState(false);
  const [migAppStartup, setMigAppStartup] = useState(false);
  const [migNotes, setMigNotes] = useState("");

  async function load() {
    setIsLoading(true);
    const [d, m] = await Promise.all([opsApi.getDeployments(), opsApi.getMigrationVerifications()]);
    setDeployments(d);
    setMigrations(m);
    setIsLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleLogDeployment() {
    if (!depEnv || !depVersion.trim()) return;
    await opsApi.logDeployment(depEnv, depVersion.trim(), depNotes.trim() || undefined);
    setDepVersion("");
    setDepNotes("");
    await load();
  }

  async function handleLogMigration() {
    if (!migEnv || !migFile.trim()) return;
    await opsApi.logMigrationVerification({
      environment: migEnv,
      migration_file: migFile.trim(),
      completed: migCompleted,
      record_counts: migRecordCounts,
      constraints: migConstraints,
      app_startup: migAppStartup,
      notes: migNotes.trim() || undefined,
    });
    setMigFile("");
    setMigCompleted(false);
    setMigRecordCounts(false);
    setMigConstraints(false);
    setMigAppStartup(false);
    setMigNotes("");
    await load();
  }

  return (
    <div className="pb-8">
      <Link href="/settings/production-readiness" className="flex items-center gap-2 text-primary hover:text-primary/80 mb-6 w-fit">
        <ArrowLeft className="w-5 h-5" />
        Quay lại Tổng quan
      </Link>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-1.5">Triển khai</h1>
      <p className="text-muted-foreground mb-6 text-sm">Lịch sử triển khai &amp; xác minh migration — bản ghi thủ công</p>

      <EnvironmentBanner />
      <OpsConsoleTabs />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-foreground mb-3">Lịch sử triển khai</h2>

          <div className="hidden md:block mb-4">
            <Card>
              <div className="space-y-3">
                <Select label="Môi trường" options={ENV_OPTIONS} value={depEnv} onChange={(e) => setDepEnv(e.target.value)} />
                <Input label="Phiên bản / commit" value={depVersion} onChange={(e) => setDepVersion(e.target.value)} />
                <Input label="Ghi chú" value={depNotes} onChange={(e) => setDepNotes(e.target.value)} />
                <Button variant="primary" size="sm" onClick={handleLogDeployment}>
                  <Plus className="w-4 h-4" />
                  Ghi nhận triển khai
                </Button>
              </div>
            </Card>
          </div>
          <p className="md:hidden text-xs text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            Chỉ thực hiện trên máy tính (Desktop only).
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : deployments.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted-foreground text-sm">Chưa có bản ghi triển khai nào</p>
            </Card>
          ) : (
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {deployments.map((d) => (
                <div key={d.id} className="px-4 py-3">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{d.entity_id}</span> — {d.action}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.staff?.full_name || "—"} · {formatRelativeTime(d.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-semibold text-foreground mb-3">Xác minh Migration</h2>

          <div className="hidden md:block mb-4">
            <Card>
              <div className="space-y-3">
                <Select label="Môi trường" options={ENV_OPTIONS} value={migEnv} onChange={(e) => setMigEnv(e.target.value)} />
                <Input label="Tên file migration" value={migFile} onChange={(e) => setMigFile(e.target.value)} />
                <div className="space-y-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={migCompleted} onChange={(e) => setMigCompleted(e.target.checked)} /> Migration completed
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={migRecordCounts} onChange={(e) => setMigRecordCounts(e.target.checked)} /> Record counts
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={migConstraints} onChange={(e) => setMigConstraints(e.target.checked)} /> Constraints
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={migAppStartup} onChange={(e) => setMigAppStartup(e.target.checked)} /> Application startup
                  </label>
                </div>
                <Input label="Ghi chú" value={migNotes} onChange={(e) => setMigNotes(e.target.value)} />
                <Button variant="primary" size="sm" onClick={handleLogMigration}>
                  <Plus className="w-4 h-4" />
                  Ghi nhận xác minh
                </Button>
              </div>
            </Card>
          </div>
          <p className="md:hidden text-xs text-muted-foreground mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            Chỉ thực hiện trên máy tính (Desktop only).
          </p>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : migrations.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-muted-foreground text-sm">Chưa có bản ghi xác minh migration nào</p>
            </Card>
          ) : (
            <div className="bg-card rounded-xl border border-border divide-y divide-border">
              {migrations.map((m) => (
                <div key={m.id} className="px-4 py-3">
                  <p className="text-sm text-foreground font-mono">{m.entity_id}</p>
                  <p className="text-xs text-muted-foreground">{m.action}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.staff?.full_name || "—"} · {formatRelativeTime(m.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
