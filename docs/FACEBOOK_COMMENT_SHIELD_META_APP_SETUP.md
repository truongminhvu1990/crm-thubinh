# Facebook Live Comment Shield — Meta App Setup Guide

Companion to `docs/FACEBOOK_COMMENT_SHIELD_SPEC.md`. This module's DB/code
is complete on Dev, but nothing can connect to a real Facebook Page until a
Meta App exists and its permissions are approved — this doc is the checklist
for that separate, PO-owned step.

## 1. Create the Meta App

1. Go to https://developers.facebook.com/apps → **Create App**.
2. Use case: **Other** → **Business**.
3. App type: **Business**.
4. Link the App to the Business Portfolio that owns the Facebook Page(s)
   this tool will manage (Business Manager → Business Settings, if not
   already set up).
5. In the App dashboard, add the **Facebook Login for Business** product
   (not "Facebook Login" for consumer apps — Business login is required to
   request Page permissions on behalf of a Business Portfolio Page).

## 2. Configure OAuth

In **Facebook Login for Business → Settings**:

- **Valid OAuth Redirect URIs**: add exactly
  `https://<your-domain>/api/facebook-tools/pages/oauth/callback`
  for every environment that will connect a Page (Dev preview URL, and
  Production only once this module is actually released there — see §5).
- Client OAuth Login: **On**. Web OAuth Login: **On**.

Copy **App ID** and **App Secret** (App Dashboard → Settings → Basic) into
this environment's `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` (see
`.env.example`) — never commit these.

## 3. Required permissions

| Permission | Why | Access level needed |
|---|---|---|
| `pages_show_list` | List the Pages the connecting user administers (`GET /me/accounts`) | Standard Access — available immediately, no review |
| `pages_read_engagement` | Read comment lists / counts on a Page's Live Videos | **Advanced Access** — requires App Review |
| `pages_manage_engagement` | Hide comments (`POST /{comment-id}?is_hidden=true`) — the core of this module | **Advanced Access** — requires App Review |

**Standard Access** (no review) only works for people with a role on the
App itself (Admin/Developer/Tester, added under App Dashboard → App Roles)
connecting a Page **they** administer. That's enough for Dev testing with
the same PO/admin account that owns the App, but not for any other staff
member or any Page outside the developer's own admin access.

**Advanced Access** — required before any other Admin, or any Page not
administered by an App tester, can use this module for real — needs:

1. **Business Verification** (Business Settings → Security Center) — legal
   business documents, can take days.
2. **App Review** for `pages_read_engagement` and `pages_manage_engagement`
   specifically — Meta requires a screen-recorded demo of the exact use
   case ("Admin hides all comments on a Page's livestream post after
   sales close") and a written justification. Expect a multi-day review
   cycle, and be ready for at least one round of clarifying questions from
   Meta's review team.

## 4. Development flow (before App Review is done)

1. Add the connecting Facebook account as a **Tester** under App Dashboard
   → App Roles → Roles (must accept the invite from facebook.com).
2. That account must be an admin of the target Facebook Page on Dev.
3. Set `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` / `FACEBOOK_TOKEN_ENCRYPTION_KEY`
   in the Dev environment.
4. In the app: **Facebook Tools → Comment Shield → Kết nối Facebook Page**.
   This only works for the tester account's own Pages until Advanced Access
   is granted (§3).
5. Everything downstream (Live Post Selection, Ẩn toàn bộ comment, progress
   tracking, retry) works identically in Standard Access — App Review only
   gates *who* can connect, not the feature logic itself.

## 5. Before Production

Do **not** connect a real Production Page, and do not set
`FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`/`FACEBOOK_TOKEN_ENCRYPTION_KEY` on
Production, until all of the following are true (matches this project's
standing PO-gate convention for every other module — see
`docs/FACEBOOK_COMMENT_SHIELD_SPEC.md` §Production Readiness):

- [ ] Business Verification complete
- [ ] App Review approved for `pages_read_engagement` + `pages_manage_engagement`
- [ ] Production OAuth Redirect URI added to the Meta App
- [ ] `FACEBOOK_TOKEN_ENCRYPTION_KEY` generated fresh for Production (never
      reuse the Dev key — a leaked Dev key must not be able to decrypt
      Production tokens)
- [ ] `facebook_tools.manage` explicitly granted to the intended Admin
      role(s) via the Permission Matrix UI on Production (it ships
      ungranted everywhere, same as every other new module's permissions)
- [ ] A PO decision to actually release this module to Production, same as
      every other module in this codebase

## Reference

- Graph API Batch Requests: https://developers.facebook.com/docs/graph-api/batch-requests
- Hiding comments: https://developers.facebook.com/docs/graph-api/reference/comment#Updating
- Live Videos: https://developers.facebook.com/docs/graph-api/reference/page/live_videos/
- Permissions reference: https://developers.facebook.com/docs/permissions/reference/pages_manage_engagement
