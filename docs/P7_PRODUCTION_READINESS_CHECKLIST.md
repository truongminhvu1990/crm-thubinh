# P7 — Production Readiness Checklist

**Status:** Consolidated from every P7 review document. This is a go-live gate, not a new review — every row links back to where the finding was made.

---

## Blockers (must resolve before Production go-live)

| # | Item | Source | Why it blocks |
|---|---|---|---|
| 1 | Confirm whether logged-in users can actually read/write data today (RLS `TO anon`-only gap) | `docs/P7_AUTHORIZATION_REVIEW.md` Finding 1 | If unconfirmed and the theory holds, every module is non-functional for real signed-in users right now. One login test resolves this; if confirmed, apply `supabase/migrations/20260718_rls_authenticated_role.sql` (drafted, awaiting approval). |
| 2 | Confirm Production backup/PITR coverage in the Supabase Dashboard | `docs/P7_BACKUP_RECOVERY.md` §2, §4 | Cannot be verified from this repository; going live without a confirmed backup story is a real data-loss risk. |

## High-priority, non-blocking (should resolve soon after go-live)

| # | Item | Source |
|---|---|---|
| 3 | Decide what "actor" means for Orders writes now that real Authentication exists (currently client-supplied `created_by`, not session-derived) | `docs/P7_AUTHORIZATION_REVIEW.md` Finding 2 |
| 4 | Approve and apply the audit-log migration, then implement the write-path integration | `docs/P7_AUDIT_LOGGING.md` |
| 5 | Apply the recommended index migration once approved | `docs/P7_PERFORMANCE_REVIEW.md` §4, `supabase/migrations/20260718_performance_indexes.sql` |
| 6 | Confirm `knowledge_entries`' "no RLS" decision was made with its full implication in view (public read+write via anon key, not just "no CRM references") | `docs/P7_SECURITY_REVIEW.md` §2 |

## Medium-priority (track, revisit as the business/data grows)

| # | Item | Source |
|---|---|---|
| 7 | Repo-wide service-layer error swallowing (reads silently return empty on failure) | `docs/P7_ERROR_HANDLING_REVIEW.md` §1 |
| 8 | No pagination on any List page | `docs/P7_PERFORMANCE_REVIEW.md` §1 |
| 9 | Client-side aggregation instead of Postgres aggregation in Reports/Market Intelligence/Inventory | `docs/P7_PERFORMANCE_REVIEW.md` §2 |
| 10 | N+1 query in `getCustomerOrderHistory` | `docs/P7_PERFORMANCE_REVIEW.md` §3 |
| 11 | Missing HSTS / CSP headers | `docs/P7_SECURITY_REVIEW.md` §3 |
| 12 | Input validation gaps (Customers/Products/Product Images) — pre-existing, from `docs/PRODUCTION_READINESS_REPORT.md` | `docs/P7_SECURITY_REVIEW.md` §4 |

## Already fixed in this phase

| # | Item | Source |
|---|---|---|
| 13 | Batches delete failure was silent | `docs/P7_ERROR_HANDLING_REVIEW.md` §3 |
| 14 | Settings toggle/delete/move failures were silent | `docs/P7_ERROR_HANDLING_REVIEW.md` §3 |
| 15 | Product image reorder/delete failures were silent | `docs/P7_ERROR_HANDLING_REVIEW.md` §3 |
| 16 | Three Orders GET routes had no try/catch | `docs/P7_ERROR_HANDLING_REVIEW.md` §3 |

## Already clean (no finding)

| Area | Source |
|---|---|
| Secrets management — no service-role key anywhere, `.env*` gitignored | `docs/P7_SECURITY_REVIEW.md` §1 |
| Session validation uses `auth.getUser()` (server-revalidated), not cookie-trusting `getSession()` | `docs/P7_SECURITY_REVIEW.md` §5 |
| No SQL injection or `dangerouslySetInnerHTML`-style XSS surface found | `docs/P7_SECURITY_REVIEW.md` §4 |
| Basic security headers already set (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, no `X-Powered-By`) | `next.config.ts`, `docs/P7_SECURITY_REVIEW.md` §3 |
| Env var validation fails fast at server startup | `lib/env.ts`, `instrumentation.ts` |
| Structured JSON logging on every warn/error path | `lib/logger.ts` |
| Schema fully reproducible from migration files; Dev/Production environment separation already exists | `docs/P7_BACKUP_RECOVERY.md` §1 |

## Documents produced this phase

- `docs/P7_AUTHORIZATION_REVIEW.md`
- `docs/P7_AUDIT_LOGGING.md`
- `docs/P7_ERROR_HANDLING_REVIEW.md`
- `docs/P7_SECURITY_REVIEW.md`
- `docs/P7_PERFORMANCE_REVIEW.md`
- `docs/P7_BACKUP_RECOVERY.md`
- `docs/P7_PRODUCTION_READINESS_CHECKLIST.md` (this document)
- `docs/P7_VERIFICATION_REPORT.md`

## Migrations drafted this phase (none applied — all await Product Owner approval)

- `supabase/migrations/20260718_rls_authenticated_role.sql`
- `supabase/migrations/20260718_audit_log_foundation.sql`
- `supabase/migrations/20260718_performance_indexes.sql`
