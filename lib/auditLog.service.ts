import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * Lot Product-Level Status, D5 (Product Owner Authorization, 2026-08-19).
 * Applies the existing `audit_log` foundation (supabase/migrations/
 * 20260718_audit_log_foundation.sql) - append-only, RLS INSERT restricted to
 * `authenticated`. Never a replacement for `activity_logs`
 * (lib/activityLog.service.ts): that table is a generic "what action
 * happened" feed with no before/after value capture, used broadly across
 * Marketing/Staff/Ops Console; `audit_log` exists specifically to capture
 * *field-level* before/after values, which is what this function writes.
 *
 * Best-effort (log, don't throw) - matches this codebase's established
 * convention for side-effect writes that must never block the primary
 * action (see markProductSold/createSnapshotForPurchase in
 * purchase.service.ts). Verified against Dev (2026-08-19): an authenticated
 * Supabase Auth session (the one lib/supabase.ts's browser client carries
 * once a staff member is signed in via app/login/page.tsx) can insert;
 * an anon-context call is rejected by RLS as expected.
 *
 * `client` defaults to this file's own browser-singleton import, correct
 * for every caller that runs in an actual signed-in browser session
 * (purchase.service.ts, product.service.ts's returnProductToSupplier).
 *
 * Orders module addendum (D5 completion, Product Owner Authorization,
 * 2026-08-19): lib/orders/order.repository.ts's reserveProduct/
 * releaseProduct/markProductSold run from server-side API route handlers
 * (app/api/orders/**), where this file's browser-singleton `supabase`
 * import carries no session (verified: auth.getUser() -> null there,
 * insert rejected by RLS). Those three functions now pass an explicit,
 * per-request authenticated client (built from the route's own validated
 * session cookies via lib/supabase/server.ts, the same mechanism
 * getCurrentStaffFromRequest already uses) instead of relying on this
 * default - see order.repository.ts's OrderAuditContext.
 */
export async function logStatusChange(
  input: {
    tableName: string;
    recordId: string;
    field?: string;
    before: string | null;
    after: string | null;
    actor?: string | null;
    requestPath?: string | null;
  },
  client: SupabaseClient = supabase
): Promise<void> {
  const field = input.field ?? "status";
  const { error } = await client.from("audit_log").insert({
    action: "update",
    table_name: input.tableName,
    record_id: input.recordId,
    changes: { [field]: { before: input.before, after: input.after } },
    actor: input.actor ?? null,
    request_path: input.requestPath ?? null,
  });
  if (error) console.error("Error writing audit_log entry:", error);
}
