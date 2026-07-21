import { supabase } from "@/lib/supabase";
import { MARKETING_PAGE_SIZE } from "./marketing.constants";
import {
  MarketingAutomation,
  MarketingAutomationRun,
  MarketingAutomationLog,
  MarketingCampaignAutomation,
  AutomationFilters,
  AutomationRunFilters,
  AutomationRunPage,
  AutomationStatus,
} from "@/types/marketingAutomation";
import { MarketingCampaign } from "@/types/marketing";

// Raw Supabase access only - no business logic (same split as
// lib/marketing/marketing.repository.ts / lib/salesLedger/). Package 2 -
// Repository Layer, per docs/MARKETING_AUTOMATION_SPEC.md Packages 1-3.
// Kept as a separate file from marketing.repository.ts (Marketing
// Foundation, unmodified) since this is a distinct, additive subsystem -
// not a redesign of the existing file.

const WITH_SEGMENT = "*, target_segment:marketing_segments(id, name, status), created_by_staff:staff(id, full_name)";

// ============================================================
// Automations
// ============================================================

export async function findAutomationsPage(filters: AutomationFilters): Promise<{ rows: MarketingAutomation[]; totalCount: number }> {
  let query = supabase.from("marketing_automations").select(WITH_SEGMENT, { count: "exact" });

  if (filters.search) {
    query = query.ilike("name", `%${filters.search.replace(/[%,]/g, "")}%`);
  }
  if (filters.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }
  if (filters.automationType && filters.automationType !== "All") {
    query = query.eq("automation_type", filters.automationType);
  }
  if (filters.frequency && filters.frequency !== "All") {
    query = query.eq("frequency", filters.frequency);
  }
  if (filters.triggerType && filters.triggerType !== "All") {
    query = query.eq("trigger_type", filters.triggerType);
  }

  query = query.order("updated_at", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching automations page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingAutomation[]) || [], totalCount: count ?? 0 };
}

export async function findAutomationById(id: string): Promise<MarketingAutomation | null> {
  const { data, error } = await supabase.from("marketing_automations").select(WITH_SEGMENT).eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching automation:", error);
    return null;
  }
  return data as MarketingAutomation | null;
}

export async function createAutomation(
  automation: Omit<MarketingAutomation, "id" | "created_at" | "updated_at" | "target_segment" | "created_by_staff" | "version">
): Promise<MarketingAutomation | null> {
  const { data, error } = await supabase.from("marketing_automations").insert(automation).select().single();
  if (error) {
    console.error("Error creating automation:", error);
    return null;
  }
  return data as MarketingAutomation;
}

export async function updateAutomation(
  id: string,
  fields: Partial<Pick<MarketingAutomation, "name" | "description" | "automation_type" | "trigger_type" | "frequency" | "target_segment_id" | "status" | "version">>
): Promise<MarketingAutomation | null> {
  const { data, error } = await supabase.from("marketing_automations").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating automation:", error);
    return null;
  }
  return data as MarketingAutomation;
}

export async function countAutomationsByStatus(status: AutomationStatus): Promise<number> {
  const { count, error } = await supabase
    .from("marketing_automations")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  if (error) {
    console.error("Error counting automations by status:", error);
    return 0;
  }
  return count ?? 0;
}

export async function countAllAutomations(): Promise<number> {
  const { count, error } = await supabase.from("marketing_automations").select("*", { count: "exact", head: true });
  if (error) {
    console.error("Error counting automations:", error);
    return 0;
  }
  return count ?? 0;
}

// ============================================================
// Automation Runs
// ============================================================

export async function findRunsPage(filters: AutomationRunFilters): Promise<AutomationRunPage> {
  let query = supabase
    .from("marketing_automation_runs")
    .select("*, automation:marketing_automations(id, name, automation_type)", { count: "exact" });

  if (filters.automationId) {
    query = query.eq("automation_id", filters.automationId);
  }
  if (filters.status && filters.status !== "All") {
    query = query.eq("status", filters.status);
  }

  query = query.order("started_at", { ascending: false });

  const from = (filters.page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error("Error fetching automation runs page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingAutomationRun[]) || [], totalCount: count ?? 0 };
}

export async function findLatestRunsForAutomations(automationIds: string[]): Promise<Record<string, MarketingAutomationRun>> {
  if (automationIds.length === 0) return {};
  const { data, error } = await supabase
    .from("marketing_automation_runs")
    .select("*")
    .in("automation_id", automationIds)
    .order("started_at", { ascending: false });
  if (error) {
    console.error("Error fetching latest runs for automations:", error);
    return {};
  }
  const latest: Record<string, MarketingAutomationRun> = {};
  for (const run of (data as MarketingAutomationRun[]) || []) {
    if (!latest[run.automation_id]) latest[run.automation_id] = run;
  }
  return latest;
}

export async function findRunById(id: string): Promise<MarketingAutomationRun | null> {
  const { data, error } = await supabase
    .from("marketing_automation_runs")
    .select("*, automation:marketing_automations(id, name, automation_type)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("Error fetching automation run:", error);
    return null;
  }
  return data as MarketingAutomationRun | null;
}

export async function createRun(
  run: Pick<MarketingAutomationRun, "automation_id" | "triggered_by"> & Partial<Pick<MarketingAutomationRun, "status">>
): Promise<MarketingAutomationRun | null> {
  const { data, error } = await supabase.from("marketing_automation_runs").insert(run).select().single();
  if (error) {
    console.error("Error creating automation run:", error);
    return null;
  }
  return data as MarketingAutomationRun;
}

export async function updateRun(
  id: string,
  fields: Partial<Pick<MarketingAutomationRun, "status" | "finished_at" | "duration_ms" | "error_message">>
): Promise<MarketingAutomationRun | null> {
  const { data, error } = await supabase.from("marketing_automation_runs").update(fields).eq("id", id).select().single();
  if (error) {
    console.error("Error updating automation run:", error);
    return null;
  }
  return data as MarketingAutomationRun;
}

export async function findRecentRuns(limit: number): Promise<MarketingAutomationRun[]> {
  const { data, error } = await supabase
    .from("marketing_automation_runs")
    .select("*, automation:marketing_automations(id, name, automation_type)")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("Error fetching recent automation runs:", error);
    return [];
  }
  return data as MarketingAutomationRun[];
}

export async function countRunsToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("marketing_automation_runs")
    .select("*", { count: "exact", head: true })
    .gte("started_at", startOfDay.toISOString());
  if (error) {
    console.error("Error counting today's runs:", error);
    return 0;
  }
  return count ?? 0;
}

export async function countFailedRunsToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("marketing_automation_runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "Failed")
    .gte("started_at", startOfDay.toISOString());
  if (error) {
    console.error("Error counting today's failed runs:", error);
    return 0;
  }
  return count ?? 0;
}

/** Broadcast page's Execution History (§3.6) - runs whose parent automation
 * is a Manual Broadcast, across every such automation. PostgREST embedded
 * filter (`automation.automation_type`) requires an inner join hint. */
export async function findBroadcastRunsPage(page: number): Promise<AutomationRunPage> {
  const from = (page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("marketing_automation_runs")
    .select("*, automation:marketing_automations!inner(id, name, automation_type)", { count: "exact" })
    .eq("automation.automation_type", "Manual Broadcast")
    .order("started_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("Error fetching broadcast runs page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingAutomationRun[]) || [], totalCount: count ?? 0 };
}

export async function findLatestBroadcastRun(): Promise<MarketingAutomationRun | null> {
  const { data, error } = await supabase
    .from("marketing_automation_runs")
    .select("*, automation:marketing_automations!inner(id, name, automation_type)")
    .eq("automation.automation_type", "Manual Broadcast")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("Error fetching latest broadcast run:", error);
    return null;
  }
  return data as MarketingAutomationRun | null;
}

/** Delivery Summary (§3.6) / Execution Statistics (§3.3) - counts across a
 * set of runs' logs, or all Manual Broadcast runs' logs when runIds is
 * omitted. */
export async function countBroadcastLogResults(): Promise<{ success: number; failed: number; pending: number }> {
  const { data, error } = await supabase
    .from("marketing_automation_logs")
    .select("result, run:marketing_automation_runs!inner(automation:marketing_automations!inner(automation_type))")
    .eq("run.automation.automation_type", "Manual Broadcast");
  if (error) {
    console.error("Error counting broadcast log results:", error);
    return { success: 0, failed: 0, pending: 0 };
  }
  const rows = (data as unknown as { result: string }[]) || [];
  return {
    success: rows.filter((r) => r.result === "Success").length,
    failed: rows.filter((r) => r.result === "Failed").length,
    pending: rows.filter((r) => r.result === "Pending").length,
  };
}

// ============================================================
// Automation Logs (per-recipient detail within a run)
// ============================================================

export async function findLogsByRun(runId: string, page: number): Promise<{ rows: MarketingAutomationLog[]; totalCount: number }> {
  const from = (page - 1) * MARKETING_PAGE_SIZE;
  const to = from + MARKETING_PAGE_SIZE - 1;
  const { data, error, count } = await supabase
    .from("marketing_automation_logs")
    .select("*, customer:customers(id, full_name, customer_code)", { count: "exact" })
    .eq("run_id", runId)
    .order("created_at", { ascending: true })
    .range(from, to);
  if (error) {
    console.error("Error fetching automation logs for run:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data as MarketingAutomationLog[]) || [], totalCount: count ?? 0 };
}

export async function findFailedCustomerIdsForRun(runId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("marketing_automation_logs")
    .select("customer_id")
    .eq("run_id", runId)
    .eq("result", "Failed");
  if (error) {
    console.error("Error fetching failed log customer ids:", error);
    return [];
  }
  return (data || []).map((r) => r.customer_id);
}

export async function createLogs(
  logs: Pick<MarketingAutomationLog, "run_id" | "customer_id" | "result" | "message">[]
): Promise<boolean> {
  if (logs.length === 0) return true;
  const { error } = await supabase.from("marketing_automation_logs").insert(logs);
  if (error) {
    console.error("Error creating automation logs:", error);
    return false;
  }
  return true;
}

/** Retry Failed (Revision 1) - updates a recipient's log row in place
 * (same run_id) rather than inserting a new one, so the retry never spawns
 * a new Automation Run and the original Run History entry is unchanged. */
export async function updateLogResult(runId: string, customerId: string, result: string, message: string | null): Promise<boolean> {
  const { error } = await supabase
    .from("marketing_automation_logs")
    .update({ result, message })
    .eq("run_id", runId)
    .eq("customer_id", customerId);
  if (error) {
    console.error("Error updating automation log result:", error);
    return false;
  }
  return true;
}

// ============================================================
// Campaign <-> Automation references (join table, passive - no execution)
// ============================================================

export async function findCampaignsForAutomation(automationId: string): Promise<MarketingCampaignAutomation[]> {
  const { data, error } = await supabase
    .from("marketing_campaign_automations")
    .select("*, campaign:marketing_campaigns(id, name, status)")
    .eq("automation_id", automationId)
    .order("linked_at", { ascending: false });
  if (error) {
    console.error("Error fetching campaigns linked to automation:", error);
    return [];
  }
  return data as MarketingCampaignAutomation[];
}

export async function findLinkableCampaigns(): Promise<Pick<MarketingCampaign, "id" | "name" | "status">[]> {
  const { data, error } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status")
    .in("status", ["Draft", "Active"])
    .order("name");
  if (error) {
    console.error("Error fetching linkable campaigns:", error);
    return [];
  }
  return data as Pick<MarketingCampaign, "id" | "name" | "status">[];
}

export async function linkCampaignAutomation(campaignId: string, automationId: string, linkedBy: string | null): Promise<boolean> {
  const { error } = await supabase
    .from("marketing_campaign_automations")
    .upsert({ campaign_id: campaignId, automation_id: automationId, linked_by: linkedBy }, { onConflict: "campaign_id,automation_id", ignoreDuplicates: true });
  if (error) {
    console.error("Error linking campaign to automation:", error);
    return false;
  }
  return true;
}

export async function unlinkCampaignAutomation(id: string): Promise<boolean> {
  const { error } = await supabase.from("marketing_campaign_automations").delete().eq("id", id);
  if (error) {
    console.error("Error unlinking campaign from automation:", error);
    return false;
  }
  return true;
}
