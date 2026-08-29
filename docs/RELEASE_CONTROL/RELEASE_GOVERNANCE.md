# Release Governance Model

## Required flow

```
Development
  → Dev Test
  → Dev UAT
  → Git Commit
  → Push Remote
  → Pull Request / Approved Release Path
  → 🚦 RELEASE CONTROL REVIEW
       → BLOCKED → STOP (no merge, no deploy — see PRODUCTION_HARD_STOP.md)
       → APPROVED → Authorized Merge
  → main
  → Vercel Git Integration Production Deploy
  → Actual Production Deployment Identity Verification
  → Post-Deploy Verification
  → CLOSED
```

No feature, fix, or "small change" skips this. There is no fast lane for changes believed to be low-risk — the incident this package responds to involved a change (a dashboard revenue-visibility feature) that was, in fact, low-risk and later ratified as correct. The process failure was independent of the change's actual risk level, which is exactly why risk-based shortcuts don't work here.

## Decision authority

**Only 🚦 Release Control may issue `APPROVED` or `BLOCKED`.** This is the entire point of the role — a single, unambiguous checkpoint that every release passes through.

- Development (Claude or a human developer) prepares evidence, but **cannot self-approve** a merge into `main` or a Production deployment. Not via direct git commands, not by opening and self-merging a PR, not by invoking `vercel --prod`, not by framing prior conversational approval ("the user said push the branch") as if it extended to merge/deploy — it does not, unless Release Control explicitly said so for that exact SHA.
- A Product Owner's feature/UAT sign-off is **not** a Release Control decision. They answer "is this the right thing, built correctly." Release Control answers "may this exact SHA go to Production right now." Both are required; neither substitutes for the other.
- Release Control's response must be **exactly** `APPROVED` or `BLOCKED` — see `RELEASE_PACKAGE_TEMPLATE.md`. No ambiguous approval language ("looks good," "go for it," "I think so") counts as a decision. If the response isn't literally one of those two words, treat the release as **not approved**.

## Mandatory evidence before APPROVED

Release Control must receive, at minimum (see `RELEASE_PACKAGE_TEMPLATE.md` for the exact submission format):

- Exact remote release SHA (not a local-only commit — see `PRODUCTION_HARD_STOP.md` Rule 1)
- Branch name
- PR URL or the approved release path used
- Changed-file manifest, with an explicit unrelated-files check
- Test results (unit tests, and any relevant integration/E2E)
- Build result
- Dev UAT status (with evidence — not just "UAT passed")
- Migration manifest — every migration file touched by the release, and its actual Dev/Production application status (not assumed from the file's presence in git)
- Production impact assessment — what changes for a Production user/system, including "none, this is provenance-only" where true
- Exact deployment method intended (GitHub-integration auto-deploy from `main` is the only currently-sanctioned method — see `PRODUCTION_HARD_STOP.md` Rule 3)
- Rollback/recovery considerations, where applicable (a pure additive dashboard feature and a schema-mutating migration carry very different rollback stories — say which this is)

## Mandatory evidence after deploy

Before a release may move to `CLOSED` (see `POST_DEPLOY_VERIFICATION.md` for the exact template):

- Actual Production SHA (verified post-deploy, not assumed from the merge)
- Identity classification: **EXACT SHA IDENTITY** / **CONTENT IDENTITY ONLY** / **CONTENT DIVERGED** (see `PRODUCTION_HARD_STOP.md` Rule 7)
- Production health (public route checks, no unexpected 5xx)
- Required database/function verification relevant to the release (read-only only — see `PRODUCTION_HARD_STOP.md`)
- Smoke test results
- Known limitations / evidence gaps, stated explicitly rather than silently omitted
- Incident flag, if the deployment occurred outside the approved path — see `INCIDENT_PROCEDURE.md`
