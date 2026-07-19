# P7 — Authorization Review

**Status:** Review complete. Documentation only for the findings that require a schema change (Finding 1) — see `supabase/migrations/20260718_rls_authenticated_role.sql` (drafted, **not applied**). No business rule or permission model was changed or proposed.

**Scope:** How authorization actually works today, end to end — Next.js route gate → API routes → Postgres RLS — across every module (Customers, Products, Batches, Settings, Orders, Inventory, Reports, Market Intelligence, Knowledge Vault). Does not propose role-based access control: `docs/INVENTORY_UI.md` §1.12 and `docs/ORDERS_UI.md` §20 already record the Product Owner's locked decision that this CRM is **single-tier — any authenticated staff member can perform any action** — no roles/permissions concept exists anywhere in login/session, and this review does not reopen that decision.

---

## 1. Current authorization model (as designed)

1. **Route gate** — `proxy.ts` (this Next.js version's middleware entry point, confirmed via `node_modules/next/dist/docs/01-app/01-getting-started/18-upgrading.md`) calls `supabase.auth.getUser()` on every request except `/login` and `/api/health`, and redirects unauthenticated requests to `/login`. This re-validates against the Supabase Auth server rather than trusting the session cookie (correct — the code comment at `lib/supabase/proxy.ts` via `proxy.ts:11-15` calls this out explicitly).
2. **API routes** — the matcher (`proxy.ts:31-40`) does **not** exclude `/api/orders/**` or any other API route, so every API route is covered by the same login gate as pages. There is no separate per-route authorization check inside any API route handler (confirmed: no `auth.getUser()`/`getSession()` call anywhere under `app/api/`).
3. **Database (RLS)** — every table's Row Level Security policy is `FOR ALL ... USING (true) WITH CHECK (true)`, i.e. unconditional access once a request reaches Postgres.

Given (per the locked design docs) the intended model is "any authenticated staff member, full access, no roles," the *correct* implementation of that model is: Next.js gate blocks unauthenticated browser/page access (✅ done), and RLS should grant full access to the `authenticated` Postgres role (the role PostgREST assigns to any request carrying a valid user session JWT). That is where a real gap was found.

---

## 2. Finding 1 (Critical) — RLS policies only grant the `anon` role, never `authenticated`

Verified directly against every migration file in `supabase/migrations/`: **not one `CREATE POLICY` in the entire schema targets `TO authenticated`.** Every policy is `TO anon` (e.g. `supabase/migrations/20260716_crm_baseline_customers_products.sql:211-223`, and the same pattern repeated for `master_data`/`tag_options`, `product_batches`/`product_images`, `customer_purchases`, `orders`/`order_items`/`payments`/`order_events`).

**Why this matters:** Supabase/PostgREST resolves the Postgres role from the request's JWT `role` claim — `anon` for the public anon key with no user session, `authenticated` for any signed-in user's session token (this is standard, documented Supabase/PostgREST behavior, not project-specific). RLS is default-deny: a role with zero matching policies on a table gets **zero rows** on read and a rejected write, full stop.

**The practical consequence:** once `proxy.ts`'s login gate went in and a real user signs in via `app/login/page.tsx`, every Supabase query the app makes (`lib/supabase.ts` on the client, `lib/supabase/server.ts` on the server — both use the anon key + the user's session, which resolves to Postgres role `authenticated`) should be hitting RLS with **no applicable policy on any table**, i.e. every list/detail page should render empty and every write should fail — for every module, not just one.

This is stated as a directly-observed fact about the migration files (100% verifiable by reading the SQL, no speculation), plus a well-established Supabase/Postgres RLS mechanism — not verified by an actual live login in this session, because no test credentials exist in this environment (the login page's own "Demo: Sử dụng thông tin đăng nhập từ Supabase" note implies credentials live only in the Product Owner's Supabase dashboard). **Recommended before closing this finding:** the Product Owner (or anyone with a real Supabase Auth account) logs in once and confirms whether Customers/Products/etc. render data or come back empty — that single test resolves whether this is already biting production or is still latent (e.g. if login was added very recently and hasn't been exercised against real data yet).

**Proposed fix (drafted, not applied):** `supabase/migrations/20260718_rls_authenticated_role.sql` — for every table that currently has an `"Allow full access..." TO anon` policy, adds an identical `TO authenticated` policy (same `USING (true) WITH CHECK (true)`, same permissive scope — this does not change *who* can do *what* relative to the locked "any authenticated staff member, full access" design, it only makes the already-approved model actually reach Postgres for real logged-in sessions). Per this project's database rule (schema changes require explicit Product Owner approval before being applied), this migration is written but **not executed**.

---

## 3. Finding 2 (Medium) — actor identity is client-supplied, not session-derived

Every Orders write route resolves "who did this" from `created_by`/`sales_owner` fields already stored on the order row or passed in the request body (e.g. `app/api/orders/route.ts:11-12`, `app/api/orders/[id]/route.ts:17-18`, and identically in `items/[id]/route.ts`, `[id]/lost/route.ts`, `[id]/reassign-owner/route.ts`, `[id]/complete/route.ts`, `[id]/payments/route.ts`) — each with a comment reading **"actor = created_by (Product Owner rule, until Authentication exists)."**

Authentication now exists (`proxy.ts`), but no route was updated to derive the actor from the authenticated session (`supabase.auth.getUser()`) instead of trusting a client-supplied field. Confirmed: no `app/api/**/route.ts` file calls `auth.getUser()`.

**Consequence:** since the model is single-tier with one shared trust boundary (any logged-in staff member can do anything anyway, per the locked Permission Matrix), this is not a privilege-escalation risk today — but it does mean any recorded "actor" in Orders history, and any future Audit Log (see `docs/P7_AUDIT_LOGGING.md`), is only as trustworthy as whatever string the client chose to send, not a cryptographically-tied session identity. This becomes directly relevant to Audit Logging's own trustworthiness (§3 of that doc).

**Recommendation, not implemented:** this is a business/architecture-adjacent decision (does "actor" mean the logged-in Supabase Auth user, or does it stay tied to the existing `sales_owner`/salesperson master-data concept, which predates real authentication and is a separate concept from a Supabase Auth identity?) — flagged for Product Owner decision, not resolved unilaterally, since the two are not obviously the same thing in this codebase today (a salesperson is a free-text `master_data` value; a Supabase Auth user is an email/password account — nothing links one to the other).

---

## 4. Finding 3 (Low) — no route-level authorization beyond "logged in"

Consistent with the locked single-tier model, this is not a defect — but it is worth recording precisely so a future RBAC decision (if the Product Owner ever wants one) knows the current baseline: no API route checks anything beyond "does a valid session exist" (via the shared `proxy.ts` gate). There is no per-module, per-action, or per-record check anywhere in `app/api/`.

---

## 5. Summary

| # | Finding | Severity | Action taken this review |
|---|---|---|---|
| 1 | RLS policies grant `anon` only, never `authenticated` | Critical | Migration **drafted, not applied** — `supabase/migrations/20260718_rls_authenticated_role.sql`. Awaiting Product Owner approval to apply, and a live login test to confirm current real-world impact. |
| 2 | Actor identity is client-supplied (`created_by`), not derived from the authenticated session | Medium | Documented only — flagged as a Product Owner decision (what "actor" should mean), not resolved. |
| 3 | No route-level authorization beyond "logged in" | Low (by design) | Documented for completeness; consistent with the locked single-tier permission model. Not a defect. |

No code implementing authorization logic was changed by this review. No RLS policy was modified in the live database.
