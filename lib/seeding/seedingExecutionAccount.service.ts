import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  SeedingExecutionAccount,
  CreateSeedingExecutionAccountInput,
  UpdateSeedingExecutionAccountInput,
} from "@/types/seeding";
import { logActivity } from "@/lib/activityLog.service";
import { SeedingValidationError } from "./seeding.errors";

/** Phase 2K-E — a real Facebook identity staff manually operate. Never
 * stores credentials of any kind (access token, password, cookie,
 * browser-profile secret) — this module coordinates human use of real
 * accounts, it never authenticates as them. Sibling to
 * seedingDestination.service.ts, same one-concern-per-file convention. */

export async function getExecutionAccounts(client: SupabaseClient = supabase): Promise<SeedingExecutionAccount[]> {
  const { data, error } = await client.from("seeding_execution_accounts").select("*").order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching seeding execution accounts:", error);
    return [];
  }
  return data as SeedingExecutionAccount[];
}

/** Distribution's own candidate pool — Active only, ordered by
 * created_at/id for deterministic round-robin (never display label,
 * which is mutable and must never reshuffle an established distribution
 * pattern). */
export async function getActiveExecutionAccounts(client: SupabaseClient = supabase): Promise<SeedingExecutionAccount[]> {
  const { data, error } = await client
    .from("seeding_execution_accounts")
    .select("*")
    .eq("status", "Active")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    console.error("Error fetching active seeding execution accounts:", error);
    return [];
  }
  return data as SeedingExecutionAccount[];
}

export async function getExecutionAccountById(
  id: string,
  client: SupabaseClient = supabase
): Promise<SeedingExecutionAccount | null> {
  const { data, error } = await client.from("seeding_execution_accounts").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching seeding execution account:", error);
    return null;
  }
  return data as SeedingExecutionAccount | null;
}

export async function createExecutionAccount(
  input: CreateSeedingExecutionAccountInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingExecutionAccount> {
  if (!input.display_name?.trim()) {
    throw new SeedingValidationError("display_name là bắt buộc");
  }

  const { data, error } = await client
    .from("seeding_execution_accounts")
    .insert({
      display_name: input.display_name.trim(),
      assigned_staff_id: input.assigned_staff_id ?? null,
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_execution_account_created", entity: "seeding_execution_account", entity_id: data.id },
    client
  );
  return data as SeedingExecutionAccount;
}

export async function updateExecutionAccount(
  id: string,
  changes: UpdateSeedingExecutionAccountInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<SeedingExecutionAccount> {
  if (changes.display_name !== undefined && !changes.display_name?.trim()) {
    throw new SeedingValidationError("display_name là bắt buộc");
  }

  const filtered: Record<string, unknown> = {};
  if (changes.display_name !== undefined) filtered.display_name = changes.display_name.trim();
  if (changes.status !== undefined) filtered.status = changes.status;
  if (changes.assigned_staff_id !== undefined) filtered.assigned_staff_id = changes.assigned_staff_id;
  if (changes.notes !== undefined) filtered.notes = changes.notes?.trim() || null;

  const { data, error } = await client.from("seeding_execution_accounts").update(filtered).eq("id", id).select().single();
  if (error) throw error;

  await logActivity(
    { staff_id: actorStaffId, action: "seeding_execution_account_updated", entity: "seeding_execution_account", entity_id: id },
    client
  );
  return data as SeedingExecutionAccount;
}
