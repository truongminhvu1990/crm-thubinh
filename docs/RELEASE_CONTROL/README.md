# Release Control — Deployment Governance Package

**Status:** Draft, submitted for 🚦 Release Control review. Not yet ratified as binding process.
**Created:** 2026-08-29, in direct response to a real Production governance incident on this project (see `INCIDENT_PROCEDURE.md` §Worked Example).
**Scope:** All CRM Vòng Cẩm Thạch (`crm-thubinh`) work, by any actor (Claude, human developer, automation).

This package exists because a release was merged and auto-deployed to Production while Release Control had returned **BLOCKED**. The deployed content turned out to be correct and was later **RATIFIED AFTER INCIDENT REVIEW** — but ratification is a recovery from a failure, not something the process should ever rely on. This package makes that failure structurally harder to repeat.

## The one invariant everything else serves

```
BLOCKED  =  NO MERGE  =  NO PRODUCTION DEPLOY
```

If a deployment ever reaches Production from any state other than `APPROVED` / `AUTHORIZED_FOR_MERGE`, that is by definition a **RELEASE GOVERNANCE INCIDENT** — see `INCIDENT_PROCEDURE.md`. There is no "it happened to be correct" exception to this invariant. Correctness is judged after the fact, by evidence; the process violation is judged independently of the outcome.

## What's in this package

| File | Purpose | Read this when... |
|---|---|---|
| `RELEASE_GOVERNANCE.md` | Roles, decision authority, the required release flow, evidence Release Control needs before/after a decision | You need to understand who decides what, and what they need from you |
| `RELEASE_STATE_MACHINE.md` | The formal state model, valid transitions, what counts as an incident | You need to know what state a release is in, or whether a transition is legal |
| `PRODUCTION_HARD_STOP.md` | The 10 non-negotiable rules, plus the current state of technical enforcement (what's actually configured vs. only documented) | Before touching anything Production-adjacent |
| `RELEASE_PACKAGE_TEMPLATE.md` | The evidence template a release agent fills in and hands to Release Control for an APPROVED/BLOCKED decision | You are requesting a release decision |
| `POST_DEPLOY_VERIFICATION.md` | The evidence template filled in *after* a deployment, before a release can be `CLOSED` | A deployment just happened (approved or otherwise) |
| `INCIDENT_PROCEDURE.md` | Exactly what to do if the hard stop is violated | The hard stop has already been violated — read this first, this section, right now |

## Roles

- **Development (Claude or a human developer)** — implements, tests, prepares evidence, requests a release decision. **Cannot self-approve a Production deployment or a merge into `main`, ever, under any framing** (not "PO said it's fine," not "it's trivial," not "just this once").
- **Product Owner** — sets feature scope and business acceptance criteria (UAT sign-off). Distinct from Release Control: a PO approving *what* was built is not the same as Release Control approving *that it may go to Production now, from this exact SHA*.
- **🚦 Release Control** — the only role that may issue `APPROVED` or `BLOCKED`. Reviews the evidence package in `RELEASE_PACKAGE_TEMPLATE.md`. Response must be exactly one of those two words — never "looks fine," "probably ok," "go ahead I guess."
- **Production Deployment actor/system** — today, this is Vercel's GitHub-integration auto-deploy from `main` (see `PRODUCTION_HARD_STOP.md` for why this is currently the *only* sanctioned path). Not a person who runs `vercel --prod` by hand.

## How this fits what already exists

This repo already has an in-app **Production Readiness** module (`/settings/production-readiness/*`, backed by `app/api/ops/*`) with a manually-entered Deployment History and a Release Checklist. That module is **record-keeping, not enforcement** — its own design doc (`PRODUCTION_READINESS_UI.md`) states no deployment automation exists behind it, and nothing in it currently blocks a merge or a deploy. This package doesn't replace it or ask to modify it; it defines the process discipline and evidence standard that a human should be entering into that log, and adds the actual gate (Release Control's APPROVED/BLOCKED decision) that was missing.

This package also complements, and does not replace, `OPS-001` (the Supabase Dev/Production CLI link-state safeguard documented in `CLAUDE.md` and `scripts/verify-dev-link.mjs`) — OPS-001 protects against accidental *database* actions against the wrong project; this package protects against unapproved *deployment* actions.
