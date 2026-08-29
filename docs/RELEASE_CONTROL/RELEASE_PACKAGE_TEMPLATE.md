# Release Control Contract — Submission Template

Copy this template, fill in every section with real evidence (commands and their actual output — not summaries of what you expect the output to be), and hand it to 🚦 Release Control. An incomplete section is not "assumed fine" — it's a reason to return `BLOCKED` on its own.

Release Control's response to a completed submission must be **exactly one of:**
```
APPROVED
```
or
```
BLOCKED
```
No other response counts as a decision. "Looks good," "go ahead," "probably fine" are not `APPROVED` and must be treated as `BLOCKED` (i.e., no merge, no deploy) until corrected to one of the two literal words above.

---

## RELEASE IDENTITY

- **Source branch:**
- **Remote SHA:** (must exist on `origin` — paste `git ls-remote origin <branch>` output)
- **Base SHA:** (the `main` SHA this was built from — paste `git merge-base` output)
- **PR URL or approved release path:**

## SCOPE

- **Changed files:** (full `git diff <base>...<head> --name-status` output)
- **Exclusions:** (anything deliberately left out of scope, and why)
- **Unrelated-file check:** (explicit confirmation the diff contains nothing outside the intended scope — paste the check, not just "checked")

## VERIFICATION

- **TypeScript:** (`tsc --noEmit` result)
- **Tests:** (full pass/fail count, not "tests pass")
- **Build:** (`next build` result)
- **Lint:** (ESLint result on every changed file; classify any finding as pre-existing baseline vs. introduced by this release, with evidence)
- **Dev UAT:** (status + evidence — a screenshot description, a Playwright run, or an explicit file-equivalence proof against a previously-UAT'd commit)

## DATABASE

- **Migration manifest:** (every migration file touched, full list — empty is a valid answer, state it explicitly)
- **Dev migration status:** (is it applied on Dev? verified how?)
- **Production migration plan:** (what will happen to Production's schema/functions as a result of this release — "nothing, this is app-code only" is a valid and common answer; state it explicitly rather than leaving it implied)

## DEPLOYMENT

- **Exact deployment path:** (must be the Rule 3-sanctioned path — merge to `main` → Vercel GitHub-integration auto-deploy — unless Release Control has separately approved another mechanism for this release)
- **Auto-deploy or another approved mechanism?**
- **Expected Production SHA / content-identity method:** (how will the actual deployed SHA be checked against this release afterward — see `POST_DEPLOY_VERIFICATION.md`)

## SAFETY

- **Production untouched before approval:** (explicit confirmation — no writes, no migrations, no deploys performed while preparing this submission)
- **No Production migration performed:**
- **No Production write performed:**
- **No test data created:**

---

## Release Control decision

```
APPROVED
```
or
```
BLOCKED
```

If `BLOCKED`, state the specific reason(s) — which section was insufficient, what evidence is missing, or what discrepancy was found. A `BLOCKED` without a stated reason cannot be remediated.
