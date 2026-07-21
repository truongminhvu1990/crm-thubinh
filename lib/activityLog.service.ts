import { supabase } from "./supabase";
import { ActivityLog } from "@/types/activityLog";
import { getCurrentStaff } from "@/lib/permission";
import { applyActivityLogScope } from "@/lib/permission/dataScope";

// Minimal, append-only log (Feature 8). Writing an entry is always
// best-effort - matches this codebase's established "log, don't throw"
// convention for side-effect writes that must never block the primary
// action (see markProductSold/createSnapshotForPurchase in
// purchase.service.ts).
export async function logActivity(entry: {
  staff_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
}): Promise<void> {
  const { error } = await supabase.from("activity_logs").insert(entry);
  if (error) console.error("Error logging activity:", error);
}

export async function getActivityLogsByStaff(staffId: string, limit = 10): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("staff_id", staffId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching activity logs:", error);
    return [];
  }
  return data as ActivityLog[];
}

/** Marketing Automation's Activity Timeline (docs/MARKETING_AUTOMATION_UI.md
 * §3.3/§3.8) - same table/append-only convention as getActivityLogsByStaff,
 * filtered by entity/entity_id instead of staff_id. */
export async function getActivityLogsByEntity(entity: string, entityId: string, limit = 20): Promise<ActivityLog[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*, staff:staff(full_name, staff_code)")
    .eq("entity", entity)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching activity logs for entity:", error);
    return [];
  }
  return data as ActivityLog[];
}

/** Production Readiness (Sprint v4.0.1) - Ops Console reuses activity_logs
 * as the backing store for every operational tracker (deployment log,
 * migration verification, backup confirmation, restore drill, UAT
 * progress, release checklist, Go Live approval) rather than new tables -
 * this filters by entity only (every entity_id), unlike
 * getActivityLogsByEntity which needs one specific entity_id.
 *
 * Data Scope Rollout (Sprint v4.1), Package 8 - this is the general-purpose
 * "browse activity broadly" read (unlike getActivityLogsByStaff/
 * getActivityLogsByEntity above, both left untouched since they serve
 * narrower, already-approved surfaces - Staff Detail's own feed and
 * Permission Center's per-entity view, DATA_SCOPE_ROLLOUT_UI.md §9), so
 * Activity Log's locked per-role scope (Decision 39: Owner=All/Manager=
 * Team/Sales=Own/Marketing=Own/Viewer=Own) applies here. Backward
 * compatible in practice for this function's one existing caller (the Ops
 * Console's Audit Overview, gated Owner-only) - Owner's scope is "all," so
 * this is a no-op for that caller today. */
export async function getActivityLogsByEntityType(entity: string, limit = 200): Promise<ActivityLog[]> {
  let query = supabase
    .from("activity_logs")
    .select("*, staff:staff(full_name, staff_code)")
    .eq("entity", entity);

  const staff = await getCurrentStaff();
  if (staff) query = (await applyActivityLogScope(query, staff, "staff_id")).query;

  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);

  if (error) {
    console.error("Error fetching activity logs for entity type:", error);
    return [];
  }
  return data as ActivityLog[];
}
