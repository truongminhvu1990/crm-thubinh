import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingDestination,
  SeedingExecutionAccount,
  SeedingDistributionInput,
  SeedingDistributionAssignmentRow,
  SeedingDistributionPreviewResult,
  SeedingDistributionConfirmResult,
} from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { createTaskInternal } from "./seedingTask.service";
import { SeedingValidationError } from "./seeding.errors";

/** Phase 2K-E — Architecture C (locked 2K-B/C/D): stateless
 * compute -> preview -> confirm distribution. No seeding_runs, no
 * batch/distribution-event table, no persisted preview state anywhere in
 * this file. The only persisted output of confirmDistribution is the
 * seeding_tasks rows it creates (via the existing, already-proven
 * createTaskInternal primitive — reused, not reimplemented) plus one
 * existing-shape logActivity entry. Every distribution task's action_type
 * is "Share" — the only one of the three existing action types that
 * matches "distribute this content into a destination," reused rather
 * than inventing a fourth value.
 *
 * Destinations and execution accounts are always re-fetched and ordered
 * created_at ASC, id ASC (never display label, which is mutable) — the
 * one deterministic ordering both preview and confirm must agree on for
 * the round-robin to be reproducible. */

/** Exported (Phase 2K-AI) — reused as-is by seedingComment.ai.service.ts's
 * per-target AI context resolution, the same dual-join/ownership-check
 * primitive, not a duplicate. */
export interface DistributionTargetContext {
  campaign_id: string;
  source_type: "Page" | "Personal" | "Group";
  message: string | null;
  permalink_url: string | null;
}

/** Mirrors getTargetsByCampaign's already-proven dual-join pattern
 * (lib/seeding/seedingCampaignTarget.service.ts) for a single target,
 * scoped to the given campaign so a caller-supplied campaign_target_id
 * from a different campaign can never cross-inject a distribution — same
 * discipline as createBulkCommentTasks's own campaign-ownership check. */
export async function loadTargetContext(
  campaignId: string,
  campaignTargetId: string,
  client: SupabaseClient
): Promise<DistributionTargetContext> {
  const { data, error } = await client
    .from("seeding_campaign_targets")
    .select(
      "campaign_id, facebook_page_posts(message, permalink_url), facebook_manual_content_references(source_type, message, permalink_url)"
    )
    .eq("id", campaignTargetId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SeedingValidationError("Target không thuộc campaign hiện tại");

  const row = data as unknown as {
    campaign_id: string;
    facebook_page_posts: { message: string | null; permalink_url: string | null } | null;
    facebook_manual_content_references: { source_type: string; message: string | null; permalink_url: string | null } | null;
  };
  const manual = row.facebook_manual_content_references;
  if (manual) {
    return {
      campaign_id: row.campaign_id,
      source_type: manual.source_type as "Personal" | "Group",
      message: manual.message,
      permalink_url: manual.permalink_url,
    };
  }
  return {
    campaign_id: row.campaign_id,
    source_type: "Page",
    message: row.facebook_page_posts?.message ?? null,
    permalink_url: row.facebook_page_posts?.permalink_url ?? null,
  };
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

/** Deterministic round-robin: destination[i] -> accounts[i % accounts.length].
 * Both arrays must already be ordered created_at ASC, id ASC before this
 * is called — this function does not itself sort. */
function assignRoundRobin<D, A>(destinations: D[], accounts: A[]): { destination: D; account: A }[] {
  return destinations.map((destination, i) => ({ destination, account: accounts[i % accounts.length] }));
}

async function loadOrderedDestinations(ids: string[], client: SupabaseClient): Promise<SeedingDestination[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("seeding_destinations")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SeedingDestination[];
}

async function loadOrderedExecutionAccounts(ids: string[], client: SupabaseClient): Promise<SeedingExecutionAccount[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("seeding_execution_accounts")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SeedingExecutionAccount[];
}

/** Read-only. Performs ZERO database writes — every query here is a
 * SELECT. Returns an honest preview: valid proposed assignments, every
 * exclusion reason, and every already-existing duplicate task, never
 * silently hidden. */
export async function previewDistribution(
  campaignId: string,
  input: SeedingDistributionInput,
  client: SupabaseClient = supabase
): Promise<SeedingDistributionPreviewResult> {
  const destinationIds = dedupe(input.destination_ids ?? []);
  const executionAccountIds = dedupe(input.execution_account_ids ?? []);

  const target = await loadTargetContext(campaignId, input.campaign_target_id, client);

  const [destinations, accounts] = await Promise.all([
    loadOrderedDestinations(destinationIds, client),
    loadOrderedExecutionAccounts(executionAccountIds, client),
  ]);

  const foundDestinationIds = new Set(destinations.map((d) => d.id));
  const foundAccountIds = new Set(accounts.map((a) => a.id));

  const unavailableDestinations: { destination_id: string; reason: string }[] = [];
  for (const id of destinationIds) {
    if (!foundDestinationIds.has(id)) unavailableDestinations.push({ destination_id: id, reason: "Không tìm thấy điểm đến này" });
  }
  for (const d of destinations) {
    if (d.status !== "Active") unavailableDestinations.push({ destination_id: d.id, reason: "Điểm đến đang ở trạng thái Ngừng hoạt động" });
  }

  const unavailableAccounts: { execution_account_id: string; reason: string }[] = [];
  for (const id of executionAccountIds) {
    if (!foundAccountIds.has(id)) unavailableAccounts.push({ execution_account_id: id, reason: "Không tìm thấy tài khoản thực hiện này" });
  }
  for (const a of accounts) {
    if (a.status !== "Active") unavailableAccounts.push({ execution_account_id: a.id, reason: "Tài khoản đang ở trạng thái Ngừng hoạt động" });
  }

  const activeDestinations = destinations.filter((d) => d.status === "Active");
  const activeAccounts = accounts.filter((a) => a.status === "Active");

  const warnings: string[] = [];
  if (destinationIds.length > 0 && activeDestinations.length === 0) warnings.push("Không có điểm đến nào đang hoạt động trong lựa chọn này");
  if (executionAccountIds.length > 0 && activeAccounts.length === 0) warnings.push("Không có tài khoản thực hiện nào đang hoạt động trong lựa chọn này");

  if (activeDestinations.length === 0 || activeAccounts.length === 0) {
    return {
      totalCandidates: destinationIds.length,
      assignableCandidates: 0,
      proposedAssignments: [],
      skipped: [],
      unavailableAccounts,
      unavailableDestinations,
      duplicates: [],
      warnings,
      confirmAllowed: false,
    };
  }

  const { data: existingTaskRows, error: existingError } = await client
    .from("seeding_tasks")
    .select("id, destination_id")
    .eq("campaign_target_id", input.campaign_target_id)
    .eq("action_type", "Share")
    .in("status", ["Pending", "In Progress"])
    .in(
      "destination_id",
      activeDestinations.map((d) => d.id)
    );
  if (existingError) throw existingError;
  const existingTaskByDestination = new Map(
    ((existingTaskRows ?? []) as { id: string; destination_id: string }[]).map((t) => [t.destination_id, t.id])
  );

  const proposedAssignments: SeedingDistributionAssignmentRow[] = [];
  const duplicates: { destination_id: string; existing_task_id: string }[] = [];

  for (const { destination, account } of assignRoundRobin(activeDestinations, activeAccounts)) {
    const existingTaskId = existingTaskByDestination.get(destination.id);
    if (existingTaskId) duplicates.push({ destination_id: destination.id, existing_task_id: existingTaskId });
    proposedAssignments.push({
      destination_id: destination.id,
      destination_label: destination.label,
      execution_account_id: account.id,
      execution_account_label: account.display_name,
      campaign_target_id: input.campaign_target_id,
      source_type: target.source_type,
      content_message: target.message,
      content_permalink_url: target.permalink_url,
      already_exists: !!existingTaskId,
    });
  }

  return {
    totalCandidates: destinationIds.length,
    assignableCandidates: activeDestinations.length,
    proposedAssignments,
    skipped: [],
    unavailableAccounts,
    unavailableDestinations,
    duplicates,
    warnings,
    confirmAllowed: true,
  };
}

/** Never trusts a client-submitted assignment — SeedingDistributionInput
 * carries only selection ids, the same shape preview accepts; the
 * server always recomputes the actual round-robin itself, on every call.
 * No transaction (Supabase JS has no multi-row transaction — same
 * established precedent as addTargetsToCampaign/createBulkCommentTasks):
 * partial completion is accepted and honestly reported, never silently
 * rolled back or silently claimed complete. */
export async function confirmDistribution(
  campaignId: string,
  input: SeedingDistributionInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingDistributionConfirmResult> {
  const destinationIds = dedupe(input.destination_ids ?? []);
  const executionAccountIds = dedupe(input.execution_account_ids ?? []);
  if (destinationIds.length === 0) throw new SeedingValidationError("Vui lòng chọn ít nhất một điểm đến");
  if (executionAccountIds.length === 0) throw new SeedingValidationError("Vui lòng chọn ít nhất một tài khoản thực hiện");

  await loadTargetContext(campaignId, input.campaign_target_id, client);

  const destinations = await loadOrderedDestinations(destinationIds, client);
  if (destinations.length !== destinationIds.length || destinations.some((d) => d.status !== "Active")) {
    throw new SeedingValidationError(
      "Một hoặc nhiều điểm đến đã chọn không còn khả dụng — vui lòng xem lại (preview) và thử lại"
    );
  }

  const accounts = await loadOrderedExecutionAccounts(executionAccountIds, client);
  if (accounts.length !== executionAccountIds.length || accounts.some((a) => a.status !== "Active")) {
    throw new SeedingValidationError(
      "Một hoặc nhiều tài khoản thực hiện đã chọn không còn khả dụng — vui lòng xem lại (preview) và thử lại"
    );
  }

  const result: SeedingDistributionConfirmResult = { created: [], skipped: [], failed: [] };

  for (const { destination, account } of assignRoundRobin(destinations, accounts)) {
    try {
      const created = await createTaskInternal(
        {
          campaign_target_id: input.campaign_target_id,
          action_type: "Share",
          assigned_staff_id: account.assigned_staff_id ?? undefined,
          scheduled_at: input.scheduled_at,
          execution_account_id: account.id,
          destination_id: destination.id,
        },
        actorStaffId,
        client
      );
      if (created.wasCreated) {
        result.created.push({ destination_id: destination.id, task_id: created.task.id });
      } else {
        result.skipped.push({ destination_id: destination.id, reason: "Đã có task cho điểm đến này" });
      }
    } catch (error) {
      if (error instanceof SeedingValidationError) {
        result.failed.push({ destination_id: destination.id, reason: error.message });
      } else {
        console.error("Failed to create distribution task for destination", destination.id, error);
        result.failed.push({ destination_id: destination.id, reason: "Không thể tạo task cho điểm đến này" });
      }
    }
  }

  await logActivity({ staff_id: actorStaffId, action: "seeding_batch_distributed", entity: "seeding_campaign", entity_id: campaignId }, client);

  return result;
}
