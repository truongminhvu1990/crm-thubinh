# P7 — Production Verification

**Status:** Complete for what this session can verify. Two items (RLS `authenticated`-role behavior under a real login, Supabase Dashboard backup settings) require access this session doesn't have — named explicitly below rather than assumed.

---

## 1. Definition of Done sequence (this project's standing convention)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean, no output |
| `npx eslint .` | 14 errors / 15 warnings — all `react-hooks/set-state-in-effect`, `react-hooks/exhaustive-deps`, and `@next/next/no-img-element`, on the same files/lines this project has repeatedly confirmed as a **pre-existing, repo-wide condition** across every List/Detail page (Batches, Customers, Products, Orders, Settings, purchase history, product images) in every prior increment — not introduced by this session. None of the 8 files edited this session (`app/batches/page.tsx`, `app/settings/page.tsx`, `lib/masterData.service.ts`, `lib/productImage.service.ts`, `components/product/ProductImageManager.tsx`, the 3 Orders route files) appear as *newly* flagged — `app/settings/page.tsx:69` is flagged, but at the pre-existing `loadItems()` effect call, not any line this session touched. |
| `npx next build` | ✅ Compiled successfully, all 27 routes (18 static, 9 dynamic incl. all `/api/orders/**`) registered, no errors |
| Playwright | Not configured anywhere in this repo (no config, no devDependency) — same recurring gap noted in every prior increment's DoD in this project's history. Skipped and flagged, not silently invented. |

## 2. Live verification against the running dev server

A dev server was already running on port 3000 (PID confirmed pre-existing, not started by this session — per this project's standing rule not to touch a port owner without confirming it was started this session). Verified against it directly, read-only, no state changed:

| Check | Result |
|---|---|
| `GET /api/health` | `200 {"status":"ok",...}` — confirms the app can reach the database (a `master_data` read) right now. |
| `GET /dashboard` (no session cookie) | `307 → /login` — confirms `proxy.ts`'s login gate is live and working. |
| `GET /api/orders` (no session cookie) | `307 → /login` — confirms the gate covers API routes too, not just pages (matches `docs/P7_AUTHORIZATION_REVIEW.md` §1.2's reading of the proxy matcher). |
| `GET /batches` (no session cookie) | `307 → /login` — same gate, another module. |

**What this does *not* verify:** whether a real signed-in session can actually read/write data, i.e. `docs/P7_AUTHORIZATION_REVIEW.md` Finding 1 (the `anon`-only RLS policies). All four checks above were made *without* a session, so they only ever exercised the `anon` Postgres role (which does have policies) or the pre-session redirect gate — they cannot confirm or refute what happens once a user is actually logged in. No test credentials exist in this session's environment to go further; this is called out as the #1 blocker in `docs/P7_PRODUCTION_READINESS_CHECKLIST.md` and needs one real login test to close out.

## 3. Not verifiable from this session (named explicitly, not guessed)

- Whether `authenticated`-role Supabase requests actually succeed today (needs a real login — see above).
- Supabase Dashboard backup/PITR settings for Development and Production (`docs/P7_BACKUP_RECOVERY.md` §2).
- Whether the Storage bucket (`product-images`) has any backup/versioning (`docs/P7_BACKUP_RECOVERY.md` §2).

No migration was applied. No RLS policy, table, or Supabase project setting was changed. The already-running dev server was left exactly as found.
