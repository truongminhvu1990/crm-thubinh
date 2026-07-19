# P7 — Security Review

**Status:** Review complete. No code changes in this document beyond what's already covered by `docs/P7_AUTHORIZATION_REVIEW.md` and `docs/P7_ERROR_HANDLING_REVIEW.md` (cross-referenced below rather than repeated). No dependency version was upgraded, no new library added.

---

## 1. Secrets management

- `.gitignore:34-35` ignores `.env*` except `.env.example` — confirmed no `.env.local` or equivalent is tracked in git.
- `.env.example` only lists `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — both are meant to be public (the anon key is safe to ship to the browser by Supabase's own design; it authorizes nothing on its own without a matching RLS policy).
- No `SUPABASE_SERVICE_ROLE_KEY` (or any other elevated credential) exists anywhere in the codebase — every Supabase client (`lib/supabase.ts`, `lib/supabase/server.ts`, `lib/supabase/proxy.ts`) uses only the anon key. This is good: there is no server-side privilege-escalation path if the anon key alone leaks (it already assumes public exposure), and no risk of a service-role key accidentally shipping to the client bundle.
- `lib/env.ts` + `instrumentation.ts` fail fast at server startup if either required variable is missing, rather than the app limping along with `undefined!`-asserted values — a real hardening measure already in place.
- Searched for hardcoded credentials/API keys/JWTs across the repo: none found.

## 2. Authorization / RLS

Covered in full in `docs/P7_AUTHORIZATION_REVIEW.md`. The one item worth restating here as a Security finding specifically: **`knowledge_entries` has no RLS enabled at all** (`supabase/migrations/20260717_knowledge_vault_module.sql:44-48`, explicit Product Owner requirement — "No ENUM, no FK, no CHECK, no RLS"). Unlike every other table (which is at least gated to `anon`, even if incompletely per Finding 1), this table has **no row-level restriction whatsoever** — meaning any request carrying the public anon key, authenticated or not, logged in or not, can read *and write* it directly via the Supabase REST endpoint, completely bypassing `proxy.ts`'s login gate. This was an explicit, locked requirement, not an oversight, so it isn't changed here — but it's flagged for Product Owner awareness in case "no RLS" was approved without this specific implication (fully public, not just "no CRM cross-references") in view. `knowledge_entries` currently has no application write path at all (`KNOWLEDGE_VAULT_SPEC.md` Decision 2 — read-only in the app), which limits real-world impact today to unauthenticated *reads* of its content, not writes, via direct REST calls.

## 3. Transport / browser hardening

`next.config.ts:6-17` already sets `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and disables `X-Powered-By`. Two commonly-recommended headers are absent:

- **`Strict-Transport-Security`** — not set. Recommended value: `max-age=63072000; includeSubDomains` once the production domain is confirmed to be HTTPS-only end to end (it should be, via whatever host serves Production — not verified in this session, since Production hosting configuration is outside this repo). Not added here because setting HSTS incorrectly on a domain that ever briefly serves plain HTTP can lock users out for the `max-age` duration — this one is worth a deliberate, informed decision rather than a blind addition.
- **`Content-Security-Policy`** — not set, and not proposed here. A CSP strict enough to matter would need to enumerate every script/style/image/connect source this app actually needs (Supabase Storage domains, Google Fonts via `next/font`, any Drive-hosted images per `lib/productImage.service.ts`'s Drive-URL support) — getting it wrong silently breaks the app rather than failing loudly, so this is flagged as a recommendation for a dedicated follow-up, not attempted as a same-session addition.

## 4. Input validation

Already covered in detail by the earlier `docs/PRODUCTION_READINESS_REPORT.md` (Customers/Products/Product Images: no format/bounds validation on phone, no numeric bounds on price/discount fields, no image URL/file-type validation) — not re-derived here. From a security lens specifically (rather than that report's UX lens): none of these gaps are directly exploitable as injection/XSS today, because every write goes through the Supabase client library (parameterized under the hood, not raw SQL string concatenation) and every render goes through React's default escaping (no `dangerouslySetInnerHTML` found anywhere in `components/` or `app/`). The risk is data-quality (garbage values persisted), not a classic OWASP injection/XSS vector — consistent with that report's own framing.

## 5. Session / auth mechanics

- `proxy.ts:13-15` uses `supabase.auth.getUser()`, which re-validates the session against the Supabase Auth server rather than trusting the cookie's claims unverified (`getSession()` would have been the weaker, cookie-only check) — correct choice, already the right pattern.
- Login (`app/login/page.tsx`) has no client-side rate limiting or lockout on repeated failed attempts; Supabase Auth applies its own server-side rate limits on `signInWithPassword` (outside this repo's control), so this isn't an open gap, just worth naming as "delegated to Supabase Auth, not reimplemented here" for completeness.
- No CSRF-token mechanism exists, and none is needed under this architecture: `@supabase/ssr`'s cookies default to `SameSite=Lax`, and every state-changing request goes through `fetch`/the Supabase JS client (not a plain form POST), which is the standard, sufficient mitigation for this request pattern.

## 6. Dependencies

`npm audit` reports 2 moderate advisories, both the same root cause: a `postcss` version bundled as a transitive dependency **inside `next`'s own `node_modules/next/node_modules/postcss`** (an XSS-via-unescaped-`</style>` advisory, GHSA-qx2v-qp2m-jg93). `npm audit`'s only offered fix is downgrading `next` to `9.3.3` — a major version regression from the currently-installed `16.2.10`, not a real remediation. This is Next.js's own internal build-tooling dependency (PostCSS is used for CSS processing during `next build`, not executed against user-supplied content at runtime), so real-world exploitability here is effectively nil; tracked for awareness, not acted on (upgrading/downgrading `next` itself is out of scope — "no database redesign... prefer documentation... minimize code changes" and this phase does not include a framework version change).

## 7. Summary

| Finding | Severity | Status |
|---|---|---|
| RLS gap (`anon`-only policies) | Critical | See `docs/P7_AUTHORIZATION_REVIEW.md` — migration drafted, not applied |
| `knowledge_entries` has no RLS at all (explicit, locked requirement) | Medium | Flagged for Product Owner awareness; not changed |
| No HSTS header | Low | Recommended once Production's HTTPS posture is confirmed; not added |
| No CSP header | Low | Recommended as a dedicated follow-up; not added (risk of silently breaking the app if scoped incorrectly) |
| Input validation gaps (Customers/Products/Product Images) | Low (data quality, not injection/XSS) | Already documented in `docs/PRODUCTION_READINESS_REPORT.md`; not re-fixed here |
| `postcss` transitive advisory via `next`'s bundled build tooling | Informational | Tracked; no real runtime exposure, no action taken |
| Secrets management (env vars, no service-role key anywhere) | — | Clean, no findings |
