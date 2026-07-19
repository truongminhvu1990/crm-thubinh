# P7 — Backup & Recovery

**Status:** Documentation only. No backup was taken, no restore was performed, no Supabase project setting was changed. Where this document depends on facts only visible in the Supabase Dashboard (backup plan/retention), that's stated explicitly rather than guessed.

---

## 1. What already gives this project a recovery story, independent of any backup product

- **Schema is fully reproducible from source.** Every table, column, index, trigger, and RLS policy in the live Development database traces back to a migration file under `supabase/migrations/` (confirmed against `docs/CRM_DATABASE_SPECIFICATION.md`, itself sourced only from approved migrations). If the database were lost entirely, the schema (not the data) could be rebuilt by replaying these files in date order.
- **Two environments already exist** (per `docs/PROJECT_MANIFEST.md`'s Development/Production split): `crm-thubinh-dev` (ref `uvbbevnhytuxledbxapq`, confirmed linked in `docs/INFRASTRUCTURE_INVESTIGATION_REPORT.md`) and a separate, unlinked `crm-thubinh` project (ref `ktvrgnhpdarsachxlguy`, presumed Production). A defect discovered in Development cannot corrupt Production data — the "OK Merge" gate is itself a recovery-relevant control, not just a release-process one.
- **Application-level guards already reduce how much *data* recovery is ever needed.** Settings' delete flow checks real usage before allowing a `master_data` value to be removed (`lib/masterData.service.ts`'s `isMasterDataValueInUse`); Batches' delete unlinks rather than cascades to Products. These don't replace backups, but they reduce accidental destructive-delete frequency.

## 2. What this review could not verify directly

This session has no Supabase Dashboard access (no browser, no `service_role` key, no `supabase db dump`/`db diff` capability — the same Docker-dependency gap already documented in `docs/INFRASTRUCTURE_INVESTIGATION_REPORT.md` §1 items 16–17). The following are Supabase **project-plan-dependent facts** this review cannot confirm from inside the repository, and must be confirmed by the Product Owner directly in the Dashboard (Project Settings → Backups) before this document's checklist (§4) can be marked complete:

- Whether Point-in-Time Recovery (PITR) is enabled on either project, and if so, its retention window.
- Whether the Supabase plan tier for `crm-thubinh` (Production) includes daily backups at all — this is plan-gated on Supabase (Free tier: none; Pro and above: daily backups, with PITR as a paid add-on).
- Storage bucket (`product-images`) backup/versioning status — Supabase Storage backups are governed separately from Postgres backups.

## 3. Recommended recovery procedure (by scenario)

**Accidental bad data (e.g. a wrong bulk edit, a mistaken delete) in Development:** restore from the most recent Supabase-managed backup or PITR snapshot prior to the incident, via the Dashboard. If no backup covers the window (e.g. Free-tier Dev project with no backups — plausible, unconfirmed per §2), the only recovery path is re-entering the lost data manually or restoring from whatever the last known-good export was; there is currently no independent export/dump cadence in this repo. **Recommendation:** the Product Owner confirms Development's backup coverage and decides whether a lightweight scheduled export is worth adding, given Development data has already been described as low-risk/low-volume in this project's history (e.g. `docs/ORDERS_RESET_PLAN.md` proceeded specifically because both legacy Orders tables were confirmed at 0 rows).

**Full database loss/corruption (Production):** restore the most recent Supabase-managed backup via the Dashboard, then replay any `supabase/migrations/*.sql` file dated after that backup's timestamp (if the loss predates the latest schema change) to bring the schema current before the app is pointed back at it.

**Schema drift or a bad migration applied to Production:** per this project's established pattern (see `docs/ORDERS_RESET_PLAN.md`'s "drop and recreate" precedent), a corrective migration should be authored, reviewed, and approved the same way every other schema change in this project has been — never a direct, unreviewed Dashboard edit against Production.

**Application (not data) failure — a bad deploy:** rollback is a code-level revert (git), not a data-recovery action — out of scope for this document, in scope for whatever the Production hosting/CI setup is (not part of this repository).

## 4. Backup & Recovery readiness checklist

| Item | Status |
|---|---|
| Schema fully reproducible from `supabase/migrations/` | ✅ Confirmed |
| Dev/Production environment separation | ✅ Confirmed (`docs/PROJECT_MANIFEST.md`) |
| PITR enabled on Production | ❓ **Needs Product Owner confirmation in Supabase Dashboard** |
| Daily backups enabled on Production (plan-dependent) | ❓ **Needs Product Owner confirmation in Supabase Dashboard** |
| Backup coverage on Development | ❓ **Needs Product Owner confirmation in Supabase Dashboard** |
| Storage bucket (`product-images`) backup/versioning | ❓ **Needs Product Owner confirmation in Supabase Dashboard** |
| Documented restore procedure per scenario | ✅ This document, §3 |
| Documented corrective-migration process for schema issues | ✅ Already established practice (`docs/ORDERS_RESET_PLAN.md` precedent), restated here |

The four ❓ items are the concrete gate before this document can be called complete — none are actionable from inside this session or this repository.
