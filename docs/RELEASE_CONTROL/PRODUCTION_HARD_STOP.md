# Production Hard Stop

## The 10 rules

**Rule 1 — No Production deployment from local-only commits.**
If a commit does not exist on `origin` (verifiable with `git ls-remote origin | grep <sha>` or `git branch -r --contains <sha>`), it must never be the source of a Production deployment. This is exactly how the incident this package responds to happened: a commit built and deployed from a branch that existed only on one machine.

**Rule 2 — No direct `vercel --prod` from an unapproved local working tree.**
Any Production deployment triggered by a human or agent running `vercel --prod` locally — as opposed to Vercel's own GitHub-integration auto-deploy reacting to a merge into `main` — bypasses every git-based identity check this package relies on. Treat any such command as prohibited unless Release Control has explicitly approved that exact mechanism for that exact SHA in advance (see Rule 3).

**Rule 3 — No Production deployment from an unmerged release branch**, unless an explicit Release Control-approved deployment mechanism exists *and* exact artifact/SHA identity can be proven end to end. Today, no such mechanism exists or is approved — see the Vercel section of the audit below. Until one is defined and approved, **the only sanctioned Production deployment path is: merge into `main` → Vercel's GitHub-integration auto-deploy.**

**Rule 4 — `BLOCKED` means:**
- no merge
- no Production deploy
- no migration
- no Production write

Not "not yet," not "unless it's urgent." `BLOCKED` is a full stop until a subsequent, explicit `APPROVED` is issued for the (possibly revised) release.

**Rule 5 — Production deployment must originate from a traceable remote Git state.** "Traceable" means: present on `origin`, reachable from the ref that Vercel's Production environment actually builds from, and identifiable by an exact SHA that can be independently re-derived by anyone auditing later (`git ls-remote`, GitHub's Deployments API, or Vercel's own dashboard/API).

**Rule 6 — The release identity chain must be provable:**
```
Release Source → Remote Release SHA / PR → Merge SHA → Actual Production Deployment SHA → Content identity verification
```
Every arrow above must be demonstrable with a command whose output is included in the evidence package, not asserted from memory.

**Rule 7 — Literal SHA equality is not required when merging creates a new merge SHA**, provided content identity is proven with:
```
git diff <approved-release-sha> <actual-merged/deployed-sha>
```
returning empty output. The system must still explicitly classify the result as one of:
- **EXACT SHA IDENTITY** — the two SHAs are literally equal.
- **CONTENT IDENTITY ONLY** — the SHAs differ (e.g., a merge commit was created) but the diff is empty.
- **CONTENT DIVERGED** — the diff is non-empty; this is a discrepancy requiring a Release Control decision, not a Development-level judgment call.

**Rule 8 — Actual Production deployment SHA must be verified after deployment**, not assumed from the merge commit or from Vercel's dashboard label alone. Use an independently queryable source (GitHub's Deployments API, `sha` field, cross-checked against `git ls-remote origin refs/heads/main`).

**Rule 9 — A successful Preview deployment does NOT automatically authorize Production.** A Preview build succeeding proves the artifact builds and its SHA is real; it says nothing about Release Control's decision. Promoting a Preview to Production, where technically possible, still requires the same `RELEASE_REVIEW → APPROVED` gate as any other path.

**Rule 10 — No release is `CLOSED` until post-deployment verification is complete.** See `RELEASE_STATE_MACHINE.md` and `POST_DEPLOY_VERIFICATION.md`.

## Prohibited actions (absolute, for any agent — Claude included — acting under this package)

- Deploying to Production
- Merging any PR
- Pushing to `main`
- Modifying Production data, schema, or permissions
- Applying any migration to Production
- Running `vercel --prod` or any Vercel action that changes Production
- Modifying Vercel project settings
- Modifying GitHub branch protection or repository settings
- Creating Production test data
- Rolling back Production automatically (see `INCIDENT_PROCEDURE.md` — rollback is always a Release Control decision, never an automatic response)

If a command could write, or you are unsure whether it writes: **stop and report it as blocked. Do not improvise, do not "just check first," do not silently work around the ambiguity.**

## Current technical enforcement status (audited 2026-08-29)

This section states what is *actually configured* today, verified where possible, distinct from what this package *recommends*. See the chat-delivered audit for full detail and evidence commands; this is the operative summary.

| Control | Status | Evidence |
|---|---|---|
| `main` branch protection | **NOT ENABLED** | `GET /repos/.../branches/main` → `"protected": false` (public GitHub API, no auth needed) |
| Required PR before merge | **NOT ENFORCED** | Follows directly from no branch protection — nothing prevents a direct push to `main` |
| Required reviews | **NOT ENFORCED** | Same |
| Required status checks | **NOT ENFORCED** — and none exist to require: no CI is configured at all | No `.github/workflows/` directory exists in this repository |
| Force-push to `main` | **TECHNICALLY POSSIBLE** | Follows from no branch protection |
| Admin bypass of rules | **N/A** | There are no rules configured to bypass |
| Vercel deployment gate tied to Release Control | **DOES NOT EXIST** | No `vercel.json`, no GitHub Environment protection rule, no required-approval step found in the repository; Vercel's GitHub integration deploys `main` on every push, automatically |
| OPS-001 Supabase Dev/Prod link safeguard | **EXISTS AND WORKS** | `scripts/verify-dev-link.mjs` + `CLAUDE.md` — read-only check, exits non-zero on Production being linked, does not auto-correct |
| Production Readiness in-app module | **EXISTS, RECORD-KEEPING ONLY** | `app/api/ops/deployments`, `app/api/ops/checklist` — manually-entered log and checklist; explicitly documented (`PRODUCTION_READINESS_UI.md`) as having no deployment automation behind it; does not block anything |

**Bottom line: today, nothing outside this document and human discipline stops a merge to `main` or a Production deploy from happening the same way the incident happened.** This package is process-only until the recommended technical controls (see the chat report's enforcement recommendations) are actually configured by a repository admin.
