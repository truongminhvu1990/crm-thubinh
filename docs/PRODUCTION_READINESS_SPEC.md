# Production Readiness — Business Design Spec

**Sprint:** v4.0.1 — Production Readiness (no new business features)
**Module:** Cross-cutting (Production Readiness) — not a product module
**Status:** Draft — Revision 2. Product Owner issued 5 scoped Decisions (22–26); applied below, nothing else changed. Awaiting Product Owner Review.
**Phase:** Business design only. No SQL, no migration, no code, no UI, no implementation were written for this document.
**Based on:** the 8 prior "P7" review documents (`P7_AUTHORIZATION_REVIEW.md`, `P7_AUDIT_LOGGING.md`, `P7_ERROR_HANDLING_REVIEW.md`, `P7_SECURITY_REVIEW.md`, `P7_PERFORMANCE_REVIEW.md`, `P7_BACKUP_RECOVERY.md`, `P7_PRODUCTION_READINESS_CHECKLIST.md`, `P7_VERIFICATION_REPORT.md`), `PRODUCTION_READINESS_REPORT.md`, `INFRASTRUCTURE_INVESTIGATION_REPORT.md`, and direct inspection of the current repository. This document does not repeat those reviews' investigative work — it **formalizes their findings into the 20 areas requested**, reconciles what has changed since they were written, and is explicit everywhere a claim can't be verified from this repository alone.

**Critical context this document must state up front, since it changes what "production-ready" means:** the P7 reviews (committed 2026-07-19) scoped themselves to Customers/Products/Batches/Settings/Product Images/Orders/Inventory/Reports/Market Intelligence/Knowledge Vault. Since then, **Marketing, Marketing Automation, Sales Commission, Staff Management, Data Verification, Sales Ledger, and the Enterprise Permission Center (Sprint v4.0.0, now FROZEN) have all shipped** — none of these were ever in scope for any P7 review. This spec cannot certify those modules as reviewed; it names this gap explicitly in §15 and §20 rather than silently treating the old P7 checklist as still covering "the app."

---

## Definition of Production Ready (Decision 22)

"Production Ready" for this CRM means **all eight** of the following are satisfied — not a majority, not a weighted score. Any one unmet dimension means the system is not production ready, regardless of how strong the others are:

| Dimension | Covered by |
|---|---|
| **Functional** | The application's business features behave as already-locked specs describe — verified through the UAT Process (§14), including UAT by Role (§14.1). |
| **Security** | §9 Security Checklist. |
| **Backup** | §4 Backup Strategy. |
| **Recovery** | §5 Restore Strategy and §16 Incident Recovery. |
| **Monitoring** | §6 Monitoring. |
| **Performance** | §10 Performance Checklist. |
| **Deployment** | §3 Deployment Strategy (and §21 Go Live Strategy). |
| **UAT** | §14 UAT Process — the formal sign-off process itself, distinct from "Functional" above (Functional is *what* is verified; UAT is the *process* that verifies it and produces a sign-off). |

This definition governs how the Production Acceptance Checklist (§15) is read: every Critical item there traces back to one of these eight dimensions being unmet, not to an arbitrary severity guess.

---

## 1. Production Architecture

**As it exists today, not as designed:**

- A single Next.js 16 (App Router) codebase, one Git branch (`main`) — there is no separate `production` branch; "Development" and "Production" are two different **Supabase database projects**, differentiated by which project's URL/anon key is active, not two codebases (`PROJECT_MANIFEST.md`'s "Branch Strategy" section describes an aspirational split that doesn't correspond to actual git branches today).
- Client architecture is overwhelmingly **direct browser → Supabase** (anon key, RLS-gated) for every module except **Orders** and the **Enterprise Permission Center**, which route their writes (and, for Permission Center, now their reads too) through Next.js API Route Handlers (`app/api/orders/**`, `app/api/permissions/**`).
- Auth: Supabase Auth, gated by `proxy.ts` middleware (`supabase.auth.getUser()` on every request except `/login` and `/api/health`).
- **Where and how Production is actually hosted is not specified anywhere in this repository** — no `vercel.json`, no `Dockerfile`, no `docker-compose.yml`, no CI config of any kind exists. This is the single largest architecture gap this document surfaces: a hosting/runtime decision that must exist somewhere (the app is presumably already live, given "Production" is referenced as a real environment throughout Project Rules) but is undocumented in-repo.

**Open decision, not resolved here:** confirm and document the actual Production hosting platform, its region, its runtime (Node.js version, serverless vs. long-running server), and how `proxy.ts` middleware executes there (Edge runtime vs. Node runtime affects the `@supabase/ssr` cookie-handling code path already in use).

---

## 2. Environment Strategy

Two Supabase projects exist today:

- **Production** — project `crm-thubinh` (unlinked from this repo's Supabase CLI config; confirmed to exist via `supabase projects list`, never connected to for schema changes from this session).
- **Development** — currently linked project `crm-thubinh-dev-v2` (created 2026-07-18). **Note:** the P7 docs (2026-07-19) refer to a project named `crm-thubinh-dev` with a different project ref — the linked Development project has since been recreated/replaced without that change being documented anywhere. This kind of silent environment drift is itself a process gap this spec flags (§20).
- Environment selection is entirely by `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`), validated at startup by `lib/env.ts` (fails fast if missing) — there is no environment-name variable, no feature-flag system, and no runtime check that prevents a Development-configured build from accidentally being deployed against Production credentials or vice versa.
- `docs/DEVELOPMENT_DATABASE_FOUNDATION.md` already flagged (§5 item 7) that this repo has no way to cross-check its own "Development" assumption against a real Production connection — worth re-stating here since Production readiness depends on the two environments genuinely being kept in schema parity, and nothing enforces that today beyond manual migration discipline.

**Decision needed:** should there be an explicit `APP_ENV`/`NODE_ENV`-driven guard that refuses to boot (or loudly warns) if Development-looking credentials are used in what's declared to be a Production deploy? Not decided here.

---

## 3. Deployment Strategy

**Today: there is no deployment automation of any kind in this repository.** No CI pipeline runs `tsc`/`lint`/`build` before a release; no deploy step is scripted; releases happen by some out-of-repo, undocumented mechanism, gated only by the human process already defined in `PROJECT_MANIFEST.md` (Development → ... → "OK Merge" → Production).

For this document to responsibly cover "Deployment Strategy" without inventing a specific vendor, it defines the **minimum shape** a deploy process needs, deferring the concrete tool choice:

- A build step that runs `npx tsc --noEmit`, `npm run build`, and `npm run lint` and **fails the deploy** on any error — today these are run manually per the project's own Definition of Done, with no automated gate stopping a broken build from reaching Production.
- A single source of truth for which Supabase project a given deploy targets (§2) — environment variables set per-deploy-target, not committed.
- A documented promotion path: the same build artifact tested against Development should be what ships to Production, not a rebuild from source against different config (to avoid "works in Dev, breaks in Prod" from an unrelated dependency update landing in between).
- Database migrations are **applied manually today** (`supabase db query --linked -f <file>`, confirmed as this session's own mechanism, and per `INFRASTRUCTURE_INVESTIGATION_REPORT.md`'s finding that historical migrations were applied outside the CLI's tracked ledger entirely) — there is no migration step wired into any deploy pipeline, because no deploy pipeline exists.

**Open decision:** name the actual hosting/CI platform and build the real pipeline — explicitly out of scope for this Business Design document (`Do not write SQL / Migration / Code / UI / Implementation`), but the gap itself must be on record before Production sign-off (§15).

---

## 4. Backup Strategy

Restates and does not re-investigate `P7_BACKUP_RECOVERY.md`, since nothing has changed since it was written that this document can newly verify:

- Schema is fully reproducible from `supabase/migrations/*.sql` — **data is not** backed up by anything in this repository.
- Whether Point-in-Time Recovery (PITR) is enabled, and at what retention window, on **either** Supabase project is unconfirmed — this depends on the Supabase billing plan tier (PITR is a paid add-on) and a Dashboard setting, neither visible from this repo or CLI access level.
- The `product-images` Storage bucket has its own, separately-governed backup/versioning posture (Supabase Storage backups are not automatically covered by Postgres PITR) — also unconfirmed.
- **This is not a hypothetical risk:** the `uat_round2_data_loss` incident (2026-07-18) already happened once — the entire Development database (all 11 tables) was found empty, confirmed via direct SQL rather than an RLS artifact, and the root cause was never determined. Whatever backup posture exists today did not (or could not) prevent or explain that incident.

**Product Owner action required, not resolvable from this repo:** confirm, per Supabase project, in the Dashboard: (1) current plan tier, (2) whether PITR is enabled and its retention window, (3) whether a daily/weekly logical backup schedule exists independent of PITR, (4) Storage bucket backup/versioning status. Until confirmed, Production must be treated as **backup posture unknown**, not "backed up."

---

## 5. Restore Strategy

Per-scenario restore procedures, as already reasoned in `P7_BACKUP_RECOVERY.md`, restated here as the target-state business process (not a script):

| Scenario | Restore approach | Status |
|---|---|---|
| Bad data introduced in Development | Point-in-time restore (if PITR enabled) or restore from most recent backup snapshot; Development data loss is low-severity by definition | Procedure known, backup availability unconfirmed (§4) |
| Full database loss/corruption in Production | Restore from Supabase-managed backup/PITR to a new project or in-place, then re-point DNS/env vars | Procedure known, backup availability unconfirmed (§4); "re-point" mechanism depends on the undocumented hosting setup (§1, §3) |
| Schema drift / bad migration applied | Roll forward with a corrective migration (never edit an already-applied migration file) — same discipline already used throughout this project's migration history | Established practice, already followed |
| Bad application deploy (not data) | Redeploy the last known-good build/commit | **Explicitly out of scope for this repository** — depends entirely on the undocumented hosting/CI mechanism (§1, §3); cannot be specified further here |
| Storage bucket (product images) loss | Unconfirmed — depends on whether Storage versioning/backup is enabled (§4) | Unconfirmed |

**Recovery Time Objective (RTO) / Recovery Point Objective (RPO):** not set anywhere in this project's history. This document does not invent numbers a business hasn't agreed to — flagged as an open decision (§20) since every restore procedure above is unbounded without one.

---

## 6. Monitoring

**Today: no monitoring exists.** Confirmed via `package.json` — no Sentry, Datadog, New Relic, LogRocket, or any APM/error-tracking/uptime dependency of any kind. The only signal available today is whatever the (undocumented) hosting platform's own default logs surface, plus `lib/logger.ts`'s structured console output (§7).

What Production readiness needs, described at the business-requirement level (no vendor chosen here, per the "do not write implementation" instruction):

- **Uptime/availability monitoring** — something external pinging `/api/health` (which already exists and is deliberately excluded from the auth gate for exactly this purpose, `proxy.ts:31-40`) on an interval, alerting a human when it fails.
- **Error-rate monitoring** — currently nothing aggregates the `console.error` calls `lib/logger.ts` and every service-layer catch block already produce; they only exist in whatever raw log stream the host retains, unsearched and unalerted-on unless someone happens to look.
- **Database health** — Supabase's own project dashboard provides basic metrics (connections, query performance, storage) already, without any repo-side work — the gap is whether anyone is watching it, not whether it exists.

**Open decision:** choose a monitoring vendor/approach (a lightweight uptime pinger plus a log-aggregation or error-tracking SDK are the two categories to decide between) — not decided here.

---

## 7. Logging

**What exists:** `lib/logger.ts` — a small, hand-rolled structured logger (`info`/`warn`/`error`), each call producing a single-line JSON object (`timestamp`, `level`, `message`, optional `context`), written to `console.log`/`warn`/`error` only. Used in `proxy.ts` (auth-gate rejections) and scattered service-layer catch blocks. **No external sink** — nothing persists these logs beyond whatever the hosting platform's own stdout/stderr capture retains, for however long that platform retains it (unconfirmed, since the platform itself is undocumented, §1).

**What most of the codebase actually does instead** (per `P7_ERROR_HANDLING_REVIEW.md`, restated since it's directly relevant to Production log quality): the dominant pattern across `lib/*.service.ts` is `console.error(message, error)` followed by returning an empty/null value to the caller — meaning a real backend failure and "no data yet" are visually indistinguishable to both the end user and, without log correlation, to whoever is debugging a production incident after the fact.

**Gaps to close before this can be called "production logging," not decided/implemented here:**
- No request-correlation ID threading requests through to their log lines (useful once more than one API route exists per request chain, which is already true for Orders and Permission Center).
- No log retention/searchability plan beyond "whatever the host keeps."
- No log level configuration by environment (Development and Production log identically today).

---

## 8. Error Handling

Restates `P7_ERROR_HANDLING_REVIEW.md`'s findings, which remain accurate (nothing has changed the dominant pattern since):

- **Two areas have real, typed error handling**: Orders (`app/api/orders/_errors.ts`, mapping `OrderNotFoundError`/`OrderValidationError`/`OrderRuleViolationError`/`OrderRepositoryError` to HTTP status codes) and the **Permission Center** (`app/api/permissions/_errors.ts`, mapping `PermissionServiceError` to a 400, matching the same shape Orders established). Both are the model to extend from, not something this document invents.
- **Everything else** — Customers, Products, Batches, Settings, Product Images, Reports, Marketing, Commission, Inventory, Market Intelligence, Knowledge Vault, Staff, Data Verification — reads fail silently (`console.error` + empty return) at the service layer; writes generally surface *some* error to the UI but inconsistently (six specific gaps were found and fixed in the P7 pass; the underlying repo-wide pattern itself was left as documented-not-refactored, since fixing it fully is a cross-module change outside any single review's scope).
- No global error boundary strategy is described anywhere for unhandled exceptions reaching the Next.js App Router's own error handling (`error.tsx`/`global-error.tsx` files) — not confirmed to exist; not in scope to add here.

**Recommendation for Production sign-off, not a redesign:** the *pattern* two modules already use (typed error classes → one shared HTTP-mapping function) is proven and low-risk to extend to new API routes going forward (including any future Permission Center enforcement rollout into other modules) — this document recommends it become the **required** pattern for any new server-side code, without retrofitting existing client-direct modules, which would be a business-rule/architecture change outside this sprint's stated boundary ("no redesign").

---

## 9. Security Checklist

Restates `P7_SECURITY_REVIEW.md`, reconciled with what has changed since:

| Item | Status |
|---|---|
| Secrets management (`.env*` gitignored, only anon key ever used, no service-role key in app code) | ✅ Clean, unchanged |
| Fail-fast env validation (`lib/env.ts`, `instrumentation.ts`) | ✅ Clean, unchanged |
| No hardcoded credentials, no raw SQL, no `dangerouslySetInnerHTML` anywhere | ✅ Clean, unchanged |
| Auth session validation uses `auth.getUser()` (server-revalidated), not `getSession()` | ✅ Clean, unchanged |
| RLS: every policy scoped `TO anon` only, `authenticated` sessions would get zero rows/rejected writes everywhere | ⚠️ **P7 found this as Critical Blocker #1.** The fix (`20260718_rls_authenticated_role.sql`) has since been **applied** (per this project's own record of BUG-001) — treat as resolved, but **re-confirm live against a real authenticated session before Production sign-off**, since it was never live-verified even after applying, per `P7_VERIFICATION_REPORT.md`'s own stated limitation. |
| `knowledge_entries` table has no RLS at all (explicit, deliberate Product Owner requirement) | ⚠️ Still true, still an explicit accepted risk — re-confirm the Product Owner still wants this given the table is now reachable by anyone with the public anon key, bypassing login entirely. |
| Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) | ✅ Set (`next.config.ts`) |
| Security headers: `Strict-Transport-Security`, `Content-Security-Policy` | ❌ Missing — HSTS needs confirmation Production is HTTPS-only (depends on the undocumented hosting platform, §1) before adding; CSP needs a scoped policy to avoid breaking the app, not decided here. |
| Dependency audit | ⚠️ 2 moderate advisories, both inside `next`'s own bundled `postcss`, no real runtime exposure found, no upstream fix available without an unacceptable Next.js downgrade — tracked, accepted. |
| CSRF | ✅ Not applicable — SameSite cookies + fetch/JS client, no form-POST attack surface. |
| Login rate limiting | Delegated to Supabase Auth server-side — not independently verified from this repo. |
| **Enterprise Permission Center** (new since P7, not covered by any prior security review) | Server-side write *and* read enforcement now exists for Permission Center's own admin surface (via `settings.manage`, session-scoped permission cache) — but this enforcement is **not yet wired into any other module's actual queries** (Decision 1 of that sprint, deliberate). Every other module's RLS remains uniformly permissive to any authenticated user, same as before Permission Center existed. This is not a regression — it's the sprint's own stated, disclosed boundary — but it means "the CRM now has roles and permissions" must not be read as "the CRM now enforces them everywhere." |

---

## 10. Performance Checklist

Restates `P7_PERFORMANCE_REVIEW.md`, still accurate:

| Item | Status |
|---|---|
| Pagination on List pages (Customers, Products, Batches, Orders, Inventory, and every module built since) | ❌ None anywhere — every list loads its entire table on every visit. Low risk at current scale (hundreds–low thousands of rows per table); real risk if any table grows materially. |
| Server-side (Postgres) aggregation for Reports/Market Intelligence/Inventory stats | ❌ Client-side JS aggregation over fully-fetched row sets throughout `lib/reports/`, `lib/report.service.ts`, `lib/batchReport.service.ts`, `lib/marketIntelligence/`, `lib/inventory.service.ts` |
| N+1 query pattern | ⚠️ One confirmed instance: `getCustomerOrderHistory` (`lib/orders/order.service.ts`) loops a per-order item lookup after an initial full fetch. |
| Missing indexes on frequently filtered/sorted columns | ⚠️ Drafted, not applied: `customer_purchases.sale_date`/`.product_id`, `products.status`/`.category`, `customers.vip_level`/`.assigned_salesperson` (`supabase/migrations/20260718_performance_indexes.sql`). Separately, the Permission Center migration (`20260729_permission_center_module.sql`) **did** apply its own indexes for its new tables — a good precedent that new work should keep following, not evidence the older drafted-not-applied migration was subsumed by it (it's a different, unrelated set of tables). |
| Permission Resolution caching | ✅ Now exists for the Permission Center's own hot path (session-scoped, 60s TTL, invalidated on Role/Permission change) — new since P7, not itself a performance problem. |

**Recommendation:** apply the drafted index migration before Production sign-off (purely additive, `CREATE INDEX IF NOT EXISTS`, lowest-risk item in this entire document) — a decision for the Product Owner to authorize, not performed here.

---

## 11. Database Migration Strategy

- **Current process (confirmed, not proposed):** every migration is a hand-written, dated SQL file under `supabase/migrations/`, applied manually via `supabase db query --linked -f <file>` (or, per `INFRASTRUCTURE_INVESTIGATION_REPORT.md`'s finding about the *earlier* history of this project, sometimes via the Supabase SQL Editor directly — meaning the CLI's own tracked migration ledger has historically not matched what's actually been applied). No migration in this repo runs automatically as part of any deploy.
- **Convention already established and worth keeping as-is (not redesigning it):** additive-only (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`), transaction-wrapped (`BEGIN`/`COMMIT`), a verification block of read-only `SELECT`s appended after every migration, and — per the Orders reset precedent — a documented "why" comment block at the top of every file explaining the change, never a bare SQL dump.
- **Gap:** nothing enforces that Development and Production ever end up with the same set of applied migrations. There is no migration-status table cross-check step, automated or manual, described anywhere as a standing practice — each migration's application to Production has so far depended entirely on the Product Owner/ops remembering to run it after Development sign-off.
- **Recommendation, not implemented:** before Production sign-off, produce (as a follow-up, non-code document) a full accounting of exactly which of the ~30 migration files currently in `supabase/migrations/` have actually been applied to the Production project, since no such list exists today and the CLI ledger has already been shown unreliable for this purpose once (`INFRASTRUCTURE_INVESTIGATION_REPORT.md`).

---

## 12. Rollback Strategy

- **Schema rollback:** this project's established convention is **roll-forward only** — a bad migration is corrected by a new migration, never by editing or reverting an applied one in place (consistent with the Specification/Database rules already governing this project). No `DOWN`-migration mechanism exists or is proposed; introducing one would be a process change beyond this sprint's "no redesign" boundary.
- **Data rollback:** depends entirely on backup/PITR availability (§4, unconfirmed) — without a confirmed backup posture, there is currently no way to roll back a bad data change in Production beyond whatever manual corrective queries can be constructed after the fact.
- **Application rollback:** depends entirely on the undocumented hosting/deploy mechanism (§1, §3) — cannot be specified further in this document.
- **What Permission Center specifically adds to this picture:** because its migration only ever adds nullable columns and new tables (never alters an existing constraint), rolling it back at the schema level — if ever needed — is low-risk (the new tables/columns can simply go unused); this is a direct benefit of the "purely additive" discipline already locked into `PERMISSION_DATABASE.md`, not a new rollback mechanism invented here.

---

## 13. Release Process

The process already exists and is followed — this section formalizes it rather than proposing something new, per `PROJECT_MANIFEST.md`'s Development Workflow:

```
Business Design → Product Review → Database Design → Product Review →
UI Design → Product Review → Development → Testing → UAT → OK Merge → Production
```

- Every Development-phase task in this project's history has ended with the same Definition of Done: `npx tsc --noEmit`, `npm run build`, `npm run lint`, and Playwright if UI (Playwright has never actually been configured in this repo across every module built so far — a recurring, disclosed gap, not a new one this document introduces).
- Production only ever advances on the Product Owner's explicit **"OK Merge"** — this has held without exception across every module reviewed for this document.
- **What's missing, not decided here:** an automated gate enforcing the above (§3) — today, "the DoD was run" is asserted by whoever did the work, not independently verified by any pipeline.

---

## 14. UAT Process

- **As practiced today:** manual, human-driven verification — reading actual data back via Supabase queries or the CLI, curling routes to check status codes/redirects, and (when the change is UI-facing) starting the dev server and clicking through the feature live. There is no automated end-to-end test suite anywhere in this repository (Playwright has been named as a gap in nearly every module's own DoD report going back to the earliest sprints).
- **A real, disclosed limitation:** `P7_VERIFICATION_REPORT.md` could not verify the RLS `authenticated`-role question with a real logged-in session (no test credentials existed in that session) — meaning even a "verification complete" report in this project's history has sometimes had to leave a business-critical question unconfirmed, deferred to whoever has real login credentials. This document does not fix that (no code/implementation), but flags it as a standing UAT-process gap: **at least one real staff login, across at least one of each role, should be part of every future UAT pass**, not assumed safe from static review alone.
- **What UAT does NOT cover today, worth being explicit about:** cross-browser/device testing, load/concurrency testing, and any of the Permission Center's actual enforcement behavior once it's eventually wired into other modules (out of scope until that future sprint).

### 14.1 UAT by Role (Decision 24)

The 5 legacy `StaffRole` values (`Owner`, `Manager`, `Sales`, `Marketing`, `Viewer`) are also the 5 roles seeded into the Permission Center (§9's Enterprise Permission Center row). **Read this subsection with §9's own caveat in mind: enforcement is not yet wired into any module except the Permission Center's own admin surface.** So UAT by role today verifies two different things depending on which surface is being tested, and this table is explicit about which is which:

| Role | What UAT must verify today |
|---|---|
| **Owner** | Full application access (unchanged, same as every other role today outside Permission Center). Additionally, and uniquely: can reach and use every Permission Center admin screen (Role List/Detail, Permission Matrix, Data Scope Matrix, Sensitive Field Config, Team Management, Audit History, Dashboard) and every underlying API — this is the one role actually gated differently today, since `settings.manage` is Owner-only in the seeded data. |
| **Manager** | Full application access to every other module (same as Owner, since enforcement isn't rolled out there yet) — **and** confirm write attempts to any `/api/permissions/*` endpoint correctly return 403, not silently succeed. |
| **Sales** | Same full-access verification as Manager, plus the same 403-on-Permission-Center-writes check. |
| **Marketing** | Same full-access verification as Manager, plus the same 403-on-Permission-Center-writes check. |
| **Viewer** | Same full-access verification as Manager, plus the same 403-on-Permission-Center-writes check — worth double-checking specifically for Viewer since its name implies read-only, which is **not** actually enforced anywhere outside Permission Center today; UAT must not let the name imply a restriction that doesn't exist yet. |

**The real purpose of this pass, stated plainly:** confirm the Permission Center's own access boundary works exactly as designed (Owner in, everyone else out, for its own screens/APIs) — not to confirm role-based restrictions exist elsewhere in the app, because they don't yet.

---

## 15. Production Acceptance Checklist

Consolidates every open item surfaced across §1–14 and §16–21 into one go/no-go list — deliberately not a new investigation, a rollup. Per Decision 23, split into exactly three tiers (Critical / High / Low), each item tagged with which Production Ready dimension (Decision 22) it belongs to:

### Critical (blocks "OK Merge" for this sprint's own scope)
- [ ] **[Security]** Confirm the RLS `authenticated`-role fix (§9) is live-verified against a real logged-in session, not just applied.
- [ ] **[Backup]** Confirm Production and Development backup/PITR posture in the Supabase Dashboard (§4) — currently unknown, not "acceptable" or "unacceptable," genuinely unknown.
- [ ] **[Deployment]** Document the actual Production hosting/deploy mechanism (§1, §3) — currently absent from this repository entirely.
- [ ] **[Deployment]** Reconcile which of the ~30 existing migration files have actually been applied to Production (§11) — no such list exists today.

### High
- [ ] **[Performance]** Apply the drafted performance-index migration (§10).
- [ ] **[Security]** Re-confirm the Product Owner still accepts `knowledge_entries` having no RLS (§9).
- [ ] **[Recovery]** Decide an RTO/RPO (§5) — nothing is bounded today.
- [ ] **[Functional]** Formally acknowledge that Marketing, Marketing Automation, Sales Commission, Staff Management, Data Verification, Sales Ledger, and Permission Center were never covered by any P7-equivalent review (stated at the top of this document) — either commission a follow-up review pass for them, or explicitly accept the gap.
- [ ] **[UAT]** Complete UAT by Role (§14.1) across all five roles at least once before Production sign-off.

### Low
- [ ] **[Monitoring]** Decide a monitoring approach (§6).
- [ ] **[Security]** Decide a CSP/HSTS policy (§9).
- [ ] **[Functional]** Decide whether the error-handling pattern Orders/Permission Center already use should become a written standard for future modules (§8).
- [ ] **[Deployment]** Decide the Go Live Strategy's Staging environment and Pilot rollout mechanics (§21) — new concepts to this project, not yet resourced.

**Already satisfied, confirmed by this document (not re-litigated, not one of the three tiers above):** secrets management, env validation, session validation, no injection/XSS surface, base security headers, additive-only migration discipline, roll-forward-only schema change discipline.

---

## 16. Incident Recovery

- **The one real incident this project has already had:** `uat_round2_data_loss` (2026-07-18) — the entire Development database (all 11 tables at the time) was found empty, confirmed by direct SQL query (not an RLS false-negative). **Root cause was never determined.** No incident postmortem document exists in this repo beyond the memory of that session — this document recommends one be written (retroactively, as a template for future incidents) covering: what was observed, what was ruled out, what remained unknown, and what monitoring (§6) would have caught it sooner had it existed.
- **Process today, if an incident happens in Production:** entirely ad hoc — there is no on-call rotation, no incident-severity classification, no communication template, and no defined "who has the authority to restore from backup" documented anywhere. Given Production restore itself depends on unconfirmed backup posture (§4) and an undocumented hosting mechanism (§1), incident recovery today is **best-effort, not procedural**.
- **Minimum shape recommended, not implemented:** a one-page incident runbook (who to notify, where logs/metrics would be checked once §6/§7 gaps are closed, the restore decision tree from §5) — a follow-up document, not written here since it would start prescribing operational implementation.

---

## 17. Audit Requirements

- **What exists and is live:** `activity_logs` (added in the Staff Management module, 2026-07-17 era) — append-only-by-convention (not database-enforced), logging `staff_id`/`action`/`entity`/`entity_id`/`created_at`. Actively used today by Staff, Marketing, Data Verification, and the Permission Center (every Role/Permission/Data Scope change, per that sprint's own Decision 8 requirement) — this is the **real, current** audit trail, and any future "audit requirements" work should extend it, not replace it.
- **What was separately designed but never built:** `P7_AUDIT_LOGGING.md` drafted a *different*, more general-purpose `audit_log` table (action/table_name/record_id/before-after diff/request_path), migration drafted (`20260718_audit_log_foundation.sql`) but **never applied, and no code ever reads or writes it**. This document does not recommend reviving that design now that `activity_logs` has since become the project's real, working audit mechanism for everything built after Staff Management — reconciling the two (or explicitly retiring the unused draft) is a decision for the Product Owner, not made here.
- **Coverage gap, unchanged since P7:** Customers, Products, Batches, Settings, and Product Images write directly client→Supabase with no server-side chokepoint — meaning neither `activity_logs` nor the drafted `audit_log` can observe changes to those five modules without first giving them a server-side write path (the same architectural change Orders and Permission Center already made, for unrelated reasons). Auditing those five modules is not possible today without that prerequisite.
- **Compliance framing:** no regulatory audit requirement (e.g., SOC 2, PCI, GDPR-style access logs) has been named by the Product Owner anywhere in this project's history — this document does not assume one exists. If one does apply to this business, that changes what "audit requirements" must cover well beyond what's described here, and needs to be stated explicitly.

---

## 18. Mobile API Readiness

- **Today: there is no API designed for external/mobile consumption.** The only server-side API routes that exist (`/api/orders/**`, `/api/permissions/**`, `/api/health`) were built for this same Next.js app's own client components to call from the browser — they use cookie-based session auth (via `@supabase/ssr`'s server client reading the browser's session cookies), which a native mobile app cannot straightforwardly participate in the same way a browser tab can.
- **Every other module has no API surface at all** — a mobile client would have to talk to Supabase's own auto-generated REST/PostgREST API directly, using the same anon key and the same permissive RLS posture the web client already relies on (§9) — meaning a mobile app today would inherit exactly the same "any authenticated user, full access" security model as the web app, not a more restrictive one designed for a different trust boundary (a phone in someone's pocket is a different risk profile than a browser inside the office).
- **What real mobile-API readiness would require, none of it done, none of it implemented here:**
  - A token-based (bearer JWT) auth flow, since mobile clients don't hold browser cookies the same way — Supabase Auth already supports this (`access_token`/`refresh_token` flows exist independent of the cookie-based `@supabase/ssr` path this web app uses), but nothing in this codebase currently issues or validates one for that purpose.
  - API versioning (`/api/v1/...`) — none exists; the current routes have no version prefix at all, since they've only ever needed to stay in lockstep with this same repo's own frontend.
  - Rate limiting on any publicly-reachable endpoint — none exists anywhere.
  - A documented, stable API contract (OpenAPI/Swagger or equivalent) — none exists; the current routes' request/response shapes are only implicitly defined by their TypeScript types and the one client (this app) that calls them.
- **Conclusion:** this CRM is **not mobile-API-ready** today, in the sense of exposing a deliberately-designed external API. It is reachable from a mobile browser exactly as well (or as poorly, security-wise) as from a desktop browser, and reachable from a native app only by reimplementing the same direct-Supabase pattern the web client already uses. Building real mobile-API readiness is a new-module-shaped effort explicitly out of this sprint's scope ("do not introduce new modules") — named here as a scoping fact, not proposed as work to do now.

### 18.1 Mobile Readiness Checklist (Decision 25)

None of the six items below exist today — this is a gap inventory, not an implementation plan:

| Item | Status today |
|---|---|
| **API Authentication** | ❌ No token-based (bearer JWT) auth flow issued or validated anywhere. Every existing API route trusts the browser's cookie-based session only; a mobile client has no supported way to authenticate against `/api/orders/**` or `/api/permissions/**` today. |
| **Token Refresh** | ❌ Not applicable yet, since no token flow exists to refresh. Supabase Auth's underlying `refresh_token` mechanism exists at the platform level, but nothing in this codebase issues, stores, or rotates one for a non-browser client. |
| **Versioning** | ❌ No `/api/v1/...`-style prefix or any other version scheme on any existing route — routes have only ever needed to stay in lockstep with this same repo's own frontend, so versioning was never needed until an external (mobile) consumer exists. |
| **Offline Strategy** | ❌ None. Every screen assumes an always-on connection to Supabase; there is no local cache, no queued-write/sync-on-reconnect mechanism, and no service worker or offline-storage layer anywhere in this Next.js app. |
| **Push Notification Readiness** | ❌ None. No push provider (APNs/FCM) integration, no device-token registration table or field anywhere in the schema, and no server-side event that could trigger a push today (the closest existing concept, Follow-up Center's overdue reminders, is a Sidebar badge computed client-side on page load, not a push). |
| **File Upload Readiness** | ⚠️ Partial, web-only. Product Images already has a real upload path (`components/product/ProductImageManager.tsx` → Supabase Storage), but it's built for a browser file picker, not a mobile-native upload flow (no chunked/resumable upload, no client-side image compression before upload, no explicit file-size/type limit enforced server-side beyond whatever Supabase Storage's own bucket policy allows). |

**Conclusion, unchanged from §18's own:** every item above is a prerequisite for a real mobile app, none is decided or built here, and pursuing them is explicitly out of this sprint's scope ("do not introduce new modules").

---

## 19. Future Scalability

- **Data volume:** current scale (per `P7_PERFORMANCE_REVIEW.md`) is hundreds to low thousands of rows per table — comfortable for the unindexed, unpaginated, client-aggregated patterns described in §10 today. The natural trigger points, not yet reached: pagination becomes necessary once any single list view's fetch-and-render time becomes noticeably slow to a user (likely somewhere in the low-to-mid thousands of rows, given no virtualization exists in any table component); server-side aggregation becomes necessary once Reports/Market Intelligence's full-table-fetch approach starts timing out or straining client memory.
- **Concurrency:** the "at most one open Order Item per Product" constraint (`ORDERS_DATABASE.md` §13, a pre-existing design, not re-litigated here) was already flagged as needing a real concurrency-safe mechanism at implementation time, not just an application-level check — worth re-surfacing here since Production traffic (multiple staff working concurrently) is exactly the condition that would expose a race here that low-traffic Development testing wouldn't.
- **Multi-tenancy:** this schema is single-tenant by design throughout (one business's data, no `tenant_id`/`organization_id` anywhere) — not a gap, since nothing in this project's history has ever suggested multi-tenant SaaS is the direction; noted here only so a future "should we sell this CRM to other jade/jewelry businesses" conversation starts from an accurate premise (it would be a significant re-architecture, not a config flag).
- **The Permission Center's own design already anticipated one scalability path deliberately** — `role_data_scopes`/`permission_sensitive_fields` are structured so that rolling out real per-module enforcement (Data Scope filtering on Customers/Orders/Reports/etc., the `applyDataScope()` utility already built but not yet wired in) is additive work against existing tables, not a redesign — a concrete example of "already built to scale into," not a promise this document is making up.

---

## 20. Risks

| Risk | Likelihood | Impact | Notes |
|---|---|---|---|
| Backup/PITR posture unknown on Production | Unknown (that's the risk) | Severe if a real data-loss event occurs | Directly precedented by the 2026-07-18 Dev data-loss incident, root cause never found (§4, §16) |
| Undocumented hosting/deploy mechanism | Certain (already true) | Blocks any confident answer to "how do we roll back a bad deploy" | §1, §3, §12 |
| RLS `authenticated` fix applied but never live-verified with a real session | Low-to-medium | High if wrong (would mean every signed-in user is currently locked out of, or worse, has broader access than intended, in every module) | §9, carried directly from `P7_VERIFICATION_REPORT.md`'s own stated gap |
| `knowledge_entries` has no RLS at all | Low today (no write path exists) | Grows if any future feature adds a write path without re-litigating this decision | §9 |
| Marketing/Commission/Staff/Data Verification/Permission Center never reviewed for production-readiness | Certain (already true) | Unknown — could contain the same class of issue P7 found elsewhere (error swallowing, missing indexes, etc.), unverified | Stated at the top of this document; §15 |
| No automated regression testing (Playwright never configured) | Certain (already true) | Every release depends entirely on manual verification catching regressions | §13, §14 |
| Environment drift went undocumented once already (Dev project silently recreated) | Already happened once | Could recur, and could next time involve Production if hosting/CI is ever set up without this being caught | §2 |
| No monitoring/alerting | Certain (already true) | An incident (like the 2026-07-18 one) would only be discovered by a human noticing something wrong, not by a system flagging it | §6, §16 |

---

## 21. Go Live Strategy (Decision 26)

**Two of the five stages below do not exist in this project today — this section proposes the target-state sequence Decision 26 asks for, it does not claim any of it is already built.** Today's actual, followed process has exactly two environments (Development, Production, §2) and one binary release gate ("OK Merge," §13) — no Staging environment and no Pilot-rollout concept exist anywhere in this project's history.

```
Dev  →  Staging  →  Production
                        │
                        ├─→ Pilot rollout (subset of users/staff)
                        │
                        └─→ Full rollout (everyone)
```

| Stage | Purpose | Status |
|---|---|---|
| **Dev** | Existing today (§2) — where all feature work happens, Development Supabase project, no restrictions. | ✅ Exists |
| **Staging** | A pre-Production environment, ideally schema- and data-shape-identical to Production, where a release is verified end-to-end (including a real UAT-by-Role pass, §14.1) before it ever reaches real business data. | ❌ **Does not exist.** Would require a third Supabase project (or a Production-clone strategy) and a documented process for keeping its schema in lockstep with Production (§11's migration-reconciliation gap applies here too, tripled). Not resourced, not decided. |
| **Production — Pilot rollout** | A subset of real staff (not all of them) uses the new release against real Production data for a short window before everyone gets it, to catch anything Staging/UAT missed under real usage conditions with limited blast radius. | ❌ **Does not exist as a concept in this project.** Every past release has gone to 100% of Production the moment "OK Merge" was said. Introducing a pilot cohort requires a decision on who's in it, how long the pilot window is, and what "promote to full rollout" or "roll back the pilot" looks like — none of that is decided here. |
| **Production — Full rollout** | Everyone. This is the only stage that exists today — it's what "OK Merge" has always meant so far. | ✅ Exists (as the *only* stage, today) |

**Why this matters for Production Ready (Decision 22):** the Deployment dimension is not fully satisfied by "Dev and Production exist" alone once a formal Go Live Strategy has been requested — Staging and Pilot rollout are now named as part of what "Deployment" means, and both are currently missing. This is reflected as a Low-priority item in §15 (not Critical or High, since the two-stage process that exists today has worked so far and nothing forces an immediate change) rather than invented as already resourced.

**Open decision, not resolved here:** whether to actually stand up a Staging environment and a Pilot-rollout process, and if so, on what timeline — a Product Owner call, since it has real cost (a third Supabase project, at minimum) that this document does not authorize.

---

## Explicitly Out of Scope (this document)

- Choosing or configuring any specific hosting platform, CI/CD tool, monitoring vendor, or logging sink.
- Writing any migration, index, RLS policy, or code change of any kind.
- Redesigning any frozen business rule, any locked module's business logic, or the Permission Center (FROZEN, per the task's own instruction).
- Introducing any new product module or feature.
- Setting concrete RTO/RPO numbers, choosing a CSP policy, or naming a specific mobile-auth implementation — all named as open decisions, none decided here.
- Standing up a Staging environment or a Pilot-rollout process (§21) — proposed as a target-state sequence only, not authorized or built here.

---

## Open Questions

1. **Hosting/deployment mechanism** — undocumented anywhere in this repository; must be named before this document's Blockers (§15) can be closed.
2. **Backup/PITR confirmation** — requires Product Owner Dashboard access this document/session doesn't have (§4, §15).
3. **RTO/RPO targets** — never set (§5).
4. **Monitoring vendor/approach** — not chosen (§6).
5. **CSP/HSTS policy specifics** — not scoped (§9).
6. **Whether to commission a P7-equivalent review pass for the modules built since P7** (Marketing, Marketing Automation, Sales Commission, Staff, Data Verification, Sales Ledger, Permission Center) — or explicitly accept them as unreviewed for now.
7. **Whether to reconcile or retire the drafted-but-unused `audit_log` design** now that `activity_logs` is the project's real, working audit mechanism (§17).
8. **Whether mobile API readiness (§18/§18.1) is even a near-term goal** — nothing in this project's history has stated it is; this document only assesses current readiness against the request, not whether to pursue it.
9. **Whether to stand up a Staging environment and a Pilot-rollout process** (§21) — both newly named as target-state concepts by Decision 26, neither resourced or scheduled.

---

Business Design only. No code written. No database changes. No UI changes. No frozen business rule modified. Stopping — waiting for Product Owner Review.
