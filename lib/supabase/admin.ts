import { createClient, SupabaseClient } from "@supabase/supabase-js";

/** Thrown when SUPABASE_SERVICE_ROLE_KEY isn't provisioned yet. Callers
 * catch this specifically so they can fail with a clear "not configured"
 * response instead of letting supabase-js's own unrelated connection error
 * bubble up. */
export class AdminClientConfigError extends Error {
  constructor(message = "SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình") {
    super(message);
    this.name = "AdminClientConfigError";
  }
}

/** Server-only Supabase client authenticated with the service_role key -
 * bypasses RLS entirely. Never import this from a Client Component or any
 * module reachable from the browser bundle; it exists solely for the Auth
 * Admin operations (auth.admin.createUser/deleteUser) the anon key cannot
 * perform (Staff Identity & Authentication Foundation).
 *
 * Throws AdminClientConfigError when the key isn't set yet, so callers can
 * fail gracefully with a clear configuration error rather than a raw
 * supabase-js fetch failure. Per Product Owner decision, provisioning the
 * key is separate infrastructure work - this function must not work around
 * its absence. */
export function createAdminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new AdminClientConfigError();
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
