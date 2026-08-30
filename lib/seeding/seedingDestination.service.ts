import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { SeedingDestination, SeedingDestinationWithTaskCount, CreateSeedingDestinationInput, UpdateSeedingDestinationInput } from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { parseFacebookGroupDestinationUrl } from "@/lib/facebookTools/facebookUrlParser";
import { SeedingValidationError } from "./seeding.errors";

/** Phase 2K-E — a place (Facebook Group today) work can be distributed
 * into. Deliberately independent of facebook_manual_content_references —
 * that table represents a specific existing post already discovered
 * inside a Group (Phase 2J's evidence/tracking concept); this table is a
 * reusable place directory with no content semantics at all. Sibling to
 * seedingExecutionAccount.service.ts, same one-concern-per-file
 * convention. */

export async function getDestinations(client: SupabaseClient = supabase): Promise<SeedingDestination[]> {
  const { data, error } = await client.from("seeding_destinations").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching seeding destinations:", error);
    return [];
  }
  return data as SeedingDestination[];
}

/** Phase 2K-BZ (P2 #5) — Destinations' own usage count, same
 * one-query-for-the-list-plus-one-query-for-every-task,
 * aggregate-in-application-code convention as
 * getExecutionAccountsWithStats (seedingAccountCenter.service.ts) — no
 * N+1, no new schema, reuses the existing destination_id FK. */
export async function getDestinationsWithTaskCounts(client: SupabaseClient = supabase): Promise<SeedingDestinationWithTaskCount[]> {
  const destinations = await getDestinations(client);
  if (destinations.length === 0) return [];

  const { data: taskRows, error } = await client.from("seeding_tasks").select("destination_id").not("destination_id", "is", null);
  if (error) throw error;

  const countByDestinationId = new Map<string, number>();
  for (const row of (taskRows ?? []) as { destination_id: string }[]) {
    countByDestinationId.set(row.destination_id, (countByDestinationId.get(row.destination_id) ?? 0) + 1);
  }

  return destinations.map((destination) => ({
    ...destination,
    task_count: countByDestinationId.get(destination.id) ?? 0,
  }));
}

/** Distribution's own candidate pool — Active only, ordered by
 * created_at/id for deterministic round-robin (never label, which is
 * mutable). */
export async function getActiveDestinations(client: SupabaseClient = supabase): Promise<SeedingDestination[]> {
  const { data, error } = await client
    .from("seeding_destinations")
    .select("*")
    .eq("status", "Active")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("Error fetching active seeding destinations:", error);
    return [];
  }
  return data as SeedingDestination[];
}

export async function getDestinationById(id: string, client: SupabaseClient = supabase): Promise<SeedingDestination | null> {
  const { data, error } = await client.from("seeding_destinations").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching seeding destination:", error);
    return null;
  }
  return data as SeedingDestination | null;
}

export async function createDestination(
  input: CreateSeedingDestinationInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingDestination> {
  if (!input.label?.trim()) {
    throw new SeedingValidationError("label là bắt buộc");
  }
  const url = input.permalink_url?.trim();
  if (!url) {
    throw new SeedingValidationError("permalink_url là bắt buộc");
  }

  const parsed = parseFacebookGroupDestinationUrl(url);
  if (!parsed.ok) {
    throw new SeedingValidationError(parsed.reason);
  }

  const { data: existing, error: existingError } = await client
    .from("seeding_destinations")
    .select("id")
    .eq("external_group_id", parsed.groupId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    throw new SeedingValidationError("Nhóm này đã được thêm làm điểm đến trước đó");
  }

  const { data, error } = await client
    .from("seeding_destinations")
    .insert({
      label: input.label.trim(),
      permalink_url: url,
      external_group_id: parsed.groupId,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_destination_created", entity: "seeding_destination", entity_id: data.id },
    client
  );
  return data as SeedingDestination;
}

/** Phase 2K-AA — permalink_url is editable (PO decision, 2026-08-28):
 * re-parsed and dedup-checked exactly like createDestination, only
 * excluding this record's own id from the dedup lookup so re-saving the
 * same URL (or another destination's unrelated URL) never self-rejects. */
export async function updateDestination(
  id: string,
  changes: UpdateSeedingDestinationInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingDestination> {
  if (changes.label !== undefined && !changes.label?.trim()) {
    throw new SeedingValidationError("label là bắt buộc");
  }
  if (changes.permalink_url !== undefined && !changes.permalink_url?.trim()) {
    throw new SeedingValidationError("permalink_url là bắt buộc");
  }

  const filtered: Record<string, unknown> = {};
  if (changes.label !== undefined) filtered.label = changes.label.trim();
  if (changes.status !== undefined) filtered.status = changes.status;
  if (changes.notes !== undefined) filtered.notes = changes.notes?.trim() || null;

  if (changes.permalink_url !== undefined) {
    const url = changes.permalink_url.trim();
    const parsed = parseFacebookGroupDestinationUrl(url);
    if (!parsed.ok) {
      throw new SeedingValidationError(parsed.reason);
    }

    const { data: existing, error: existingError } = await client
      .from("seeding_destinations")
      .select("id")
      .eq("external_group_id", parsed.groupId)
      .neq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      throw new SeedingValidationError("Nhóm này đã được thêm làm điểm đến trước đó");
    }

    filtered.permalink_url = url;
    filtered.external_group_id = parsed.groupId;
  }

  const { data, error } = await client.from("seeding_destinations").update(filtered).eq("id", id).select().single();
  if (error) throw error;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_destination_updated", entity: "seeding_destination", entity_id: id },
    client
  );
  return data as SeedingDestination;
}
