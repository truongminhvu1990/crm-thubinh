# Post-Deploy Verification Template

Fill this in after every Production deployment — including one that went through the normal `APPROVED` path. A release does not reach `CLOSED` (see `RELEASE_STATE_MACHINE.md`) without it. All checks here are read-only; this document never authorizes a write.

## 1. Deployment identity

- **`origin/main` HEAD:** (`git ls-remote origin refs/heads/main`)
- **Actual Production deployment SHA:** (GitHub Deployments API `environment=Production`, most recent entry's `sha`, or Vercel's own record if directly accessible)
- **Approved release SHA (from the `RELEASE_PACKAGE_TEMPLATE.md` this deployment traces back to):**
- **Comparison:** `git diff <approved-release-sha> <actual-production-sha> --stat`
- **Classification (pick exactly one, per `PRODUCTION_HARD_STOP.md` Rule 7):**
  - [ ] EXACT SHA IDENTITY
  - [ ] CONTENT IDENTITY ONLY
  - [ ] CONTENT DIVERGED — if checked, this is an automatic `RELEASE_GOVERNANCE_INCIDENT`-style discrepancy; escalate per `INCIDENT_PROCEDURE.md` §C rather than closing the release

## 2. Content verification

Trace the specific claims of the release against the actual deployed source (`git show <production-sha>:<path>`), not the approved SHA — they should be identical per §1, but verify against what's actually live.

## 3. Database / function verification (read-only only)

- Any function/RPC the release depends on — current live definition via `pg_get_functiondef`, compared against the migration file's intent
- Any reconciliation numbers the release's correctness depends on, computed via read-only `SELECT`
- Migration bookkeeping status (`supabase_migrations.schema_migrations`) — note if a migration is applied-but-unrecorded (a known pre-existing pattern on this project, not itself a new incident, but always worth stating explicitly rather than silently)
- **Reminder:** any Production database access requires the OPS-001 deliberate-relink procedure (`CLAUDE.md`, `scripts/verify-dev-link.mjs`) — link to Production, run SELECT-only queries, relink back to Dev, re-verify with `npm run db:verify-dev`. Never leave the CLI linked to Production at the end of a task.

## 4. Smoke test

- Public route health (no unexpected 5xx)
- Unauthenticated protected-route behavior (must not leak data, must not 500)
- Authenticated UI verification — **only if an already-authorized Production session is legitimately available.** If not:
  > AUTHENTICATED PRODUCTION UI VERIFICATION NOT PERFORMED — NO AUTHORIZED SESSION/CREDENTIALS AVAILABLE.
  Never fabricate a login result to fill this gap, and never treat an unfilled gap as if it were a pass.

## 5. Known limitations

State plainly anything that could not be verified from the current environment (missing CLI tooling, missing tokens, no authenticated session) rather than omitting it. A gap disclosed is not a failure; a gap hidden is.

## 6. Incident flag

- Did this deployment occur from `APPROVED` / `AUTHORIZED_FOR_MERGE`, per the state machine? **Yes / No**
- If No: this is a `RELEASE_GOVERNANCE_INCIDENT` regardless of what §1–4 show. File it per `INCIDENT_PROCEDURE.md` before proceeding further. A clean §1–4 does not cancel the incident — it feeds into the incident's own evidence review, which can end in `RATIFIED_AFTER_INCIDENT_REVIEW`, but the incident itself is still real and still gets recorded.

## 7. Release Control sign-off

Only 🚦 Release Control marks a release `CLOSED`, based on this document. Development submits it; Development does not close its own release.
