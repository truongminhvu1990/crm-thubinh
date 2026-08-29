# Incident Procedure

If you are reading this because something below just happened: skip straight to **Immediate response**, do that first, read the rest after.

## What counts as a Release Governance Incident

**A.** A `BLOCKED` release is merged anyway.
**B.** A `BLOCKED` release reaches Production.
**C.** The actual Production SHA does not match the approved release SHA, and content is not identical either (`git diff` is non-empty — a real `CONTENT DIVERGED` per `PRODUCTION_HARD_STOP.md` Rule 7).
**D.** A local-only commit (never pushed to `origin`) reaches Production.
**E.** A later normal deployment overwrites an earlier out-of-band deployment (this is exactly how the discovery happened in this project's own incident — see the worked example below).
**F.** A migration is applied to Production without a recorded Release Control approval.

Any one of these, alone, is an incident — regardless of whether the deployed content turns out to be correct. Correctness is evaluated *during* the incident procedure, as evidence toward a decision; it is never grounds to skip the procedure.

## Immediate response

```
FREEZE
  → NO further deploy
  → NO automatic rollback
  → Read-only incident verification
  → Evidence collection
  → Release Control decision
  → RATIFY or ROLLBACK decision
```

**Rollback must never happen automatically.** An automatic rollback is itself an unreviewed Production action — the same category of problem as the incident being responded to, just in the opposite direction. Rolling back a deployment that happens to be correct destroys working Production functionality for no reason; rolling back one that isn't correct, without evidence, is a guess dressed up as a fix. Both require the same thing: read-only evidence first, a human/Release-Control decision second.

Concretely, on discovering any of A–F:

1. **Stop.** Do not merge, push, deploy, migrate, or roll back anything as your next action, no matter how obvious the fix looks.
2. **Do not silently "fix it going forward" either** — e.g., quietly relinking a CLI, quietly closing a PR, quietly reverting a commit — without first surfacing the incident. Silent correction removes the evidence Release Control needs to make the FREEZE decision, and repeats the exact "no visible confirmation" failure mode this package exists to prevent.
3. **Collect read-only evidence only:**
   - Exact current `origin/main` HEAD and actual Production deployment SHA (independently, e.g. via GitHub's Deployments API)
   - `git diff <approved-sha> <actual-sha> --stat` and, if non-empty, `--name-status` and per-file diffs
   - Whether the offending commit exists on any remote ref at all (`git ls-remote`, `git branch -r --contains`)
   - Content verification of the specific feature/change against the actual deployed source
   - Read-only database verification if the release touches the database, following the OPS-001 deliberate-relink procedure — SELECT/`pg_get_functiondef` only, relink back to Dev immediately after, re-verify safe state
   - Production smoke test (public routes, no 5xx, no data leak)
4. **Report the evidence to 🚦 Release Control**, with a factual recommendation if the evidence clearly supports one, but never a self-issued decision. The output is one of:
   - **CLEAN FOR RATIFICATION REVIEW**
   - **DISCREPANCY REQUIRES RELEASE CONTROL DECISION**
   - **BLOCKED — INSUFFICIENT VERIFICATION EVIDENCE**
5. **Release Control decides** `RATIFIED AFTER INCIDENT REVIEW` or `ROLLBACK REQUIRED`. Neither Development nor an automated process makes this call.

## `RATIFIED AFTER INCIDENT REVIEW` is exceptional, not a path

If evidence shows the deployed content is correct and safe, Release Control may ratify it in place rather than rolling back working Production functionality for a process violation alone. This is a one-time recovery decision for *this* incident. It does not retroactively make the deployment "approved," it does not exempt the same content from needing a real `APPROVED` if it's ever redeployed from scratch, and — critically — **it must never be planned for.** A release plan that says "worst case, we'll just get it ratified after" has already failed before it starts; see `RELEASE_STATE_MACHINE.md`.

## Worked example — this project's actual incident (2026-08-29)

Recorded here as the concrete case this package is built from, not as a template to imitate:

1. A Revenue Management Visibility feature was implemented and deployed directly to Production from a branch (`release/revenue-reporting-production`) that was **never pushed to GitHub and never merged into `main`** — a Rule 1/Rule 3 violation (`PRODUCTION_HARD_STOP.md`) before any incident even occurred.
2. A later, entirely unrelated routine merge to `main` (an OPS-001 Supabase-safety fix, PR #7) triggered Vercel's normal auto-deploy, which silently removed the feature — because it had never actually existed in `main`'s history. This is incident type **E**.
3. The feature was re-integrated properly: isolated worktree, clean cherry-pick from the original commit, full verification (`tsc`, tests, lint, build), pushed as `release/revenue-management-main`, and a PR (#8) was opened — explicitly **not** merged, awaiting Release Control.
4. Release Control's evidence-gathering returned **BLOCKED**-equivalent status (PR open, awaiting approval — no `APPROVED` had been issued).
5. Despite that, PR #8 was merged and Vercel auto-deployed Production, **without a recorded Release Control `APPROVED`.** This is incident type **A**/**B**.
6. Read-only incident verification (git identity checks, source-content tracing, Production DB reconciliation, HTTP smoke tests) found the deployed content **CONTENT IDENTICAL** to the reviewed release SHA, all business-logic claims verified true, and no Production data/schema anomalies.
7. Outcome: **RATIFIED AFTER INCIDENT REVIEW** — the content was correct, but the process violation (step 5) is exactly what this governance package exists to make structurally harder to repeat, via the branch-protection and CI recommendations in the accompanying enforcement audit.

The lesson this package encodes is not "the deployment worked out fine so it's not a big deal" — it's that **the only reason step 6 was possible at all** is that Git and GitHub's Deployments API provided an independently verifiable identity trail. If step 1 had also involved database writes, or if the diff in step 6 had been non-empty, there would have been no clean way to reach `RATIFIED AFTER INCIDENT REVIEW` — only `ROLLBACK REQUIRED`, decided by Release Control, never automatically.
