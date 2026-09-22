import { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, AdminClientConfigError } from "@/lib/supabase/admin";

export interface StaffAuthHealthSummary {
  /** false when SUPABASE_SERVICE_ROLE_KEY isn't provisioned in this
   * environment - listing auth.users requires the Admin API, which the
   * app's normal anon/authenticated clients cannot reach (auth.users is
   * never exposed to PostgREST). All other fields are 0 when this is
   * false; callers should treat that as "not measurable here", not "no
   * problems found". */
  configured: boolean;
  totalActiveStaff: number;
  /** Active staff with `auth_user_id IS NULL`. */
  missingAuthUserId: number;
  /** Active staff with `auth_user_id` set, but no matching `auth.users`
   * row exists (an orphaned FK - e.g. the auth user was deleted). */
  authUserIdOrphaned: number;
  /** Active staff whose `email` matches no `auth.users.email` at all
   * (case-insensitive). Relevant mainly for staff relying on the email
   * fallback, but reported regardless of `auth_user_id` state since it's
   * a useful independent data-quality signal. */
  emailUnmatched: number;
  /** Active staff that would fail BOTH resolution paths today - no
   * working `auth_user_id` link AND no matching email either. This is the
   * count that actually matters operationally: these staff cannot
   * authenticate into any permission-gated feature right now. */
  unresolvable: number;
}

const EMPTY_UNCONFIGURED_SUMMARY: StaffAuthHealthSummary = {
  configured: false,
  totalActiveStaff: 0,
  missingAuthUserId: 0,
  authUserIdOrphaned: 0,
  emailUnmatched: 0,
  unresolvable: 0,
};

async function listAllAuthUsers(admin: SupabaseClient): Promise<{ id: string; email: string | null }[]> {
  const users: { id: string; email: string | null }[] = [];
  const perPage = 200;
  let page = 1;
  // auth.admin.listUsers is paginated; loop until a short page confirms
  // we've reached the end. Production has a handful of staff today, but
  // this must not silently under-count as the org grows.
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) users.push({ id: u.id, email: u.email ?? null });
    if (data.users.length < perPage) break;
    page += 1;
  }
  return users;
}

/** Diagnostic-only aggregate health check for the staff <-> auth.users
 * identity link (Production Authorization Incident, 2026-09-21) - reports
 * COUNTS ONLY, never raw staff/email data, so it can be gated at the same
 * `settings.manage` level as the rest of Permission Center without a
 * separate no-PII permission tier. Never writes anything; a repair is
 * always a separate, explicit, reviewed Production write. */
export async function getStaffAuthHealthSummary(client: SupabaseClient): Promise<StaffAuthHealthSummary> {
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch (error) {
    if (error instanceof AdminClientConfigError) return EMPTY_UNCONFIGURED_SUMMARY;
    throw error;
  }

  const [{ data: staffRows, error: staffError }, authUsers] = await Promise.all([
    client.from("staff").select("auth_user_id, email").eq("status", "Active"),
    listAllAuthUsers(admin),
  ]);
  if (staffError) throw staffError;

  const authUserIds = new Set(authUsers.map((u) => u.id));
  const authEmails = new Set(authUsers.filter((u) => u.email).map((u) => u.email!.toLowerCase()));

  let missingAuthUserId = 0;
  let authUserIdOrphaned = 0;
  let emailUnmatched = 0;
  let unresolvable = 0;

  const rows = (staffRows ?? []) as { auth_user_id: string | null; email: string | null }[];
  for (const staff of rows) {
    const hasAuthUserId = Boolean(staff.auth_user_id);
    const authUserIdResolves = hasAuthUserId && authUserIds.has(staff.auth_user_id as string);
    const emailMatches = Boolean(staff.email) && authEmails.has((staff.email as string).toLowerCase());

    if (!hasAuthUserId) missingAuthUserId += 1;
    else if (!authUserIdResolves) authUserIdOrphaned += 1;

    if (!emailMatches) emailUnmatched += 1;
    if (!authUserIdResolves && !emailMatches) unresolvable += 1;
  }

  return {
    configured: true,
    totalActiveStaff: rows.length,
    missingAuthUserId,
    authUserIdOrphaned,
    emailUnmatched,
    unresolvable,
  };
}
