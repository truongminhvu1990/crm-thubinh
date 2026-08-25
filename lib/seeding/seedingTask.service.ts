import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingTask,
  SeedingTaskWithContext,
  CreateSeedingTaskInput,
  UpdateSeedingTaskStatusInput,
  SEEDING_TASK_ALLOWED_TRANSITIONS,
} from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { SeedingValidationError } from "./seeding.errors";

const VALID_ACTION_TYPES = new Set(["Like", "Comment", "Share"]);

export async function getTasksByCampaign(campaignId: string, client: SupabaseClient = supabase): Promise<SeedingTask[]> {
  const { data, error } = await client
    .from("seeding_tasks")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching seeding tasks:", error);
    return [];
  }
  return data as SeedingTask[];
}

interface TaskWithEmbeds {
  seeding_campaigns: { name: string } | null;
  seeding_campaign_targets: {
    facebook_page_posts: {
      message: string | null;
      permalink_url: string | null;
      full_picture_url: string | null;
      discovery_status: string | null;
    } | null;
  } | null;
  [key: string]: unknown;
}

/** My Tasks (Phase 2D) — a staff member's own queue across every campaign,
 * the surface `seeding.execute` (rather than `seeding.manage`) needs.
 * Enriched with campaign name + target post context in this ONE query
 * (Supabase's embedded-select over the existing FKs: seeding_tasks.
 * campaign_id -> seeding_campaigns, seeding_tasks.campaign_target_id ->
 * seeding_campaign_targets -> facebook_page_posts) — never a follow-up
 * request per task, no N+1. A legacy task (campaign_target_id null) or a
 * target whose post context can't resolve simply gets null context
 * fields, never a crash. Filtered server-side by assigned_staff_id — the
 * caller (the API route, via getCurrentStaffFromRequest) must always pass
 * the CALLING staff's own id, never a caller-supplied one, so one staff
 * member's tasks are never visible to another. */
export async function getTasksAssignedToStaff(
  staffId: string,
  client: SupabaseClient = supabase
): Promise<SeedingTaskWithContext[]> {
  const { data, error } = await client
    .from("seeding_tasks")
    .select(
      "*, seeding_campaigns(name), seeding_campaign_targets(facebook_page_posts(message, permalink_url, full_picture_url, discovery_status))"
    )
    .eq("assigned_staff_id", staffId)
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  if (error) {
    console.error("Error fetching assigned seeding tasks:", error);
    return [];
  }

  return (data as unknown as TaskWithEmbeds[]).map((row) => {
    const { seeding_campaigns, seeding_campaign_targets, ...task } = row;
    const post = seeding_campaign_targets?.facebook_page_posts ?? null;
    return {
      ...(task as unknown as SeedingTask),
      campaign_name: seeding_campaigns?.name ?? null,
      target_message: post?.message ?? null,
      target_permalink_url: post?.permalink_url ?? null,
      target_full_picture_url: post?.full_picture_url ?? null,
      target_discovery_status: post?.discovery_status ?? null,
    };
  });
}

export async function getTaskById(id: string, client: SupabaseClient = supabase): Promise<SeedingTask | null> {
  const { data, error } = await client.from("seeding_tasks").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching seeding task:", error);
    return null;
  }
  return data as SeedingTask | null;
}

/** Phase 2C — every task belongs to a specific Campaign Target (one post
 * within a campaign); campaign_id/facebook_post_id are read from the
 * target and stored on the task too (denormalized, for backward-compat
 * query convenience, per PO decision) rather than duplicated as caller
 * input. action_type gates comment_text: required (and must be non-empty)
 * when "Comment", forced to null otherwise — "không ép tạo comment cho
 * Like/Share" (PO instruction), enforced by never persisting text for a
 * non-Comment task even if the caller sent some. */
export async function createTask(
  input: CreateSeedingTaskInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingTask> {
  if (!VALID_ACTION_TYPES.has(input.action_type)) {
    throw new SeedingValidationError(`Invalid action_type: ${input.action_type}`);
  }
  if (input.action_type === "Comment" && !input.comment_text?.trim()) {
    throw new SeedingValidationError("comment_text is required when action_type is Comment");
  }

  const { data: target, error: targetError } = await client
    .from("seeding_campaign_targets")
    .select("id, campaign_id, facebook_post_id")
    .eq("id", input.campaign_target_id)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target) throw new Error("Seeding campaign target not found");

  const { data, error } = await client
    .from("seeding_tasks")
    .insert({
      campaign_id: target.campaign_id,
      campaign_target_id: input.campaign_target_id,
      facebook_post_id: target.facebook_post_id,
      action_type: input.action_type,
      comment_text: input.action_type === "Comment" ? input.comment_text : null,
      suggested_comment_id: input.action_type === "Comment" ? (input.suggested_comment_id ?? null) : null,
      assigned_staff_id: input.assigned_staff_id ?? null,
      scheduled_at: input.scheduled_at ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity({ staff_id: actorStaffId, action: "seeding_task_created", entity: "seeding_task", entity_id: data.id }, client);
  return data as SeedingTask;
}

/** The only write path `seeding.execute` needs: report a Task's outcome.
 * Deliberately does not allow editing comment_text/assigned_staff_id/
 * scheduled_at here — reassigning or rescheduling a Task is a
 * `seeding.manage` action (createTask above), not something the assignee
 * does to their own queue.
 *
 * State machine (PO decision, 2026-08-26 — SEEDING_TASK_ALLOWED_TRANSITIONS
 * in types/seeding.ts is the single source of truth): Pending -> anything;
 * In Progress -> any terminal state, never back to Pending; every terminal
 * state (Done/Failed/Skipped/Cancelled) accepts no further transition at
 * all. An invalid transition throws before any write happens. */
export async function updateTaskStatus(
  id: string,
  input: UpdateSeedingTaskStatusInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingTask> {
  const current = await getTaskById(id, client);
  if (!current) throw new Error("Seeding task not found");

  const allowed = SEEDING_TASK_ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(input.status)) {
    throw new SeedingValidationError(`Invalid task status transition: ${current.status} -> ${input.status}`);
  }

  const { data, error } = await client
    .from("seeding_tasks")
    .update({
      status: input.status,
      result_note: input.result_note ?? null,
      executed_by_staff_id: actorStaffId,
      executed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;

  await logActivity(
    {
      staff_id: actorStaffId,
      action: `seeding_task_${input.status.toLowerCase().replace(/\s+/g, "_")}`,
      entity: "seeding_task",
      entity_id: id,
    },
    client
  );
  return data as SeedingTask;
}
