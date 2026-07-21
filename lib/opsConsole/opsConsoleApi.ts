import { ActivityLog } from "@/types/activityLog";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Yêu cầu thất bại (${res.status})`);
  return json as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Yêu cầu thất bại (${res.status})`);
  return json as T;
}

export const opsApi = {
  getChecklistState: () => getJson<Record<string, ActivityLog>>("/api/ops/checklist"),
  toggleChecklistItem: (item_key: string, checked: boolean) =>
    postJson<{ ok: true }>("/api/ops/checklist", { item_key, checked }),

  getGoLiveState: () => getJson<Record<string, ActivityLog>>("/api/ops/go-live"),
  setGoLiveApproval: (approved: boolean) => postJson<{ ok: true }>("/api/ops/go-live", { approved }),

  getUatState: () => getJson<Record<string, ActivityLog>>("/api/ops/uat"),
  markUatItem: (role: string, item_key: string, verified: boolean) =>
    postJson<{ ok: true }>("/api/ops/uat", { role, item_key, verified }),

  getDeployments: () => getJson<ActivityLog[]>("/api/ops/deployments"),
  logDeployment: (environment: string, version: string, notes?: string) =>
    postJson<{ ok: true }>("/api/ops/deployments", { environment, version, notes }),

  getMigrationVerifications: () => getJson<ActivityLog[]>("/api/ops/migrations"),
  logMigrationVerification: (fields: {
    environment: string;
    migration_file: string;
    completed: boolean;
    record_counts: boolean;
    constraints: boolean;
    app_startup: boolean;
    notes?: string;
  }) => postJson<{ ok: true }>("/api/ops/migrations", fields),

  getBackupConfirmations: () => getJson<ActivityLog[]>("/api/ops/backups"),
  logBackupConfirmation: (fields: {
    environment: string;
    plan_tier: string;
    pitr_enabled: boolean;
    retention_days?: number;
    notes?: string;
  }) => postJson<{ ok: true }>("/api/ops/backups", fields),

  getRestoreDrills: () => getJson<ActivityLog[]>("/api/ops/restores"),
  logRestoreDrill: (fields: {
    environment: string;
    backup_reference: string;
    restore_duration: string;
    result: "success" | "failure";
    notes?: string;
  }) => postJson<{ ok: true }>("/api/ops/restores", fields),

  getMobileReadinessNotes: () => getJson<Record<string, ActivityLog>>("/api/ops/mobile-readiness"),
  updateMobileReadinessNote: (item_key: string, note: string) =>
    postJson<{ ok: true }>("/api/ops/mobile-readiness", { item_key, note }),
};
