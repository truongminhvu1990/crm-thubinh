/** Thin wrapper around Meta's Graph API — the ONLY place in this module that
 * knows the API version, endpoint shapes, and error codes. Everything else
 * (facebookPage.service.ts, facebookLivePost.service.ts,
 * facebookHideJob.service.ts) calls through here, never `fetch()` directly,
 * so a Graph API version bump or endpoint change touches one file.
 *
 * Official Meta mechanisms only (per module scope): Facebook Login for
 * Business (OAuth) + Graph API. No browser automation, no personal-account
 * session.
 *
 * Shared integration layer, not Comment Shield's own file: this + the two
 * "generic" services below (facebookPage.service.ts,
 * facebookLivePost.service.ts) are deliberately kept free of anything
 * hide-job-specific, so a future Facebook-based module (e.g. a Semi Seeding
 * Assistant — not built in this phase, scope unchanged) can reuse Page
 * connection / post+comment fetching without depending on
 * facebookHideJob.service.ts at all. Only hideCommentsBatch below is
 * Comment-Shield-specific; add new endpoint functions here the same way
 * (one function per Graph edge) rather than growing this file's callers'
 * responsibilities. */

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Graph error subcodes that mean "this token is dead, the Page must be
 * reconnected" — distinct from a transient/retryable failure. Code 190 is
 * "Invalid OAuth access token"; these subcodes cover the common causes
 * (session invalidated, password changed, app permissions removed, token
 * expired). See https://developers.facebook.com/docs/graph-api/guides/error-handling. */
const RECONNECT_REQUIRED_SUBCODES = new Set([458, 459, 460, 463, 464, 467]);

export class FacebookGraphError extends Error {
  code?: number;
  subcode?: number;
  requiresReconnect: boolean;

  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.name = "FacebookGraphError";
    this.code = code;
    this.subcode = subcode;
    this.requiresReconnect = code === 190 || (subcode !== undefined && RECONNECT_REQUIRED_SUBCODES.has(subcode));
  }
}

interface GraphErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number };
}

async function graphFetch<T>(path: string, params: Record<string, string>, init?: RequestInit): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url.toString(), init);
  const body = (await response.json().catch(() => ({}))) as GraphErrorBody & Record<string, unknown>;

  if (!response.ok || body.error) {
    throw new FacebookGraphError(
      body.error?.message ?? `Graph API request failed (${response.status})`,
      body.error?.code,
      body.error?.error_subcode
    );
  }
  return body as T;
}

export interface OAuthTokenResult {
  access_token: string;
  expires_in?: number;
}

/** Step 1 of Facebook Login for Business: exchange the OAuth `code` the
 * browser received on redirect for a short-lived User Access Token.
 * `appId`/`appSecret` are passed in (not read from env here) so the caller
 * — facebookPage.service.ts — stays the single place that decides where
 * Meta App credentials come from. */
export function exchangeCodeForUserToken(
  code: string,
  redirectUri: string,
  appId: string,
  appSecret: string
): Promise<OAuthTokenResult> {
  return graphFetch<OAuthTokenResult>("/oauth/access_token", {
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  });
}

/** Step 2: exchange the short-lived User Access Token for a long-lived one
 * (~60 days) before listing Pages — Page Access Tokens minted from a
 * long-lived User token are themselves long-lived (don't expire on a fixed
 * schedule), which is what facebook_pages.access_token_encrypted stores. */
export function getLongLivedUserToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string
): Promise<OAuthTokenResult> {
  return graphFetch<OAuthTokenResult>("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortLivedToken,
  });
}

export interface FacebookPageAccount {
  id: string;
  name: string;
  access_token: string;
}

/** GET /me/accounts — every Page the authenticated Facebook user administers,
 * each with its own Page Access Token (long-lived, since it was minted from
 * a long-lived User token — see getLongLivedUserToken above). */
export async function listPagesForUser(userAccessToken: string): Promise<FacebookPageAccount[]> {
  const result = await graphFetch<{ data: FacebookPageAccount[] }>("/me/accounts", {
    access_token: userAccessToken,
    fields: "id,name,access_token",
  });
  return result.data;
}

export interface FacebookPostContent {
  id: string;
  text: string | null;
}

/** GET /{post-id}?fields=message,description — fetches a single post's text
 * for AI context (Semi Seeding Assistant's seeding_campaigns.post_content_snapshot,
 * lib/seeding/seedingCampaign.service.ts). Added here rather than in
 * lib/seeding/ itself, following this file's own extension convention: one
 * function per Graph edge, in the shared client every module reuses.
 * Requests both `message` (regular feed posts) and `description` (Live
 * Video objects) since a Semi Seeding campaign's target post id isn't
 * restricted to either kind — whichever field Facebook returns wins. */
export async function getPostContent(postId: string, pageAccessToken: string): Promise<FacebookPostContent> {
  const result = await graphFetch<{ id: string; message?: string; description?: string }>(`/${postId}`, {
    access_token: pageAccessToken,
    fields: "message,description",
  });
  return { id: result.id, text: result.message ?? result.description ?? null };
}

export interface FacebookLiveVideo {
  id: string;
  title?: string;
  description?: string;
  creation_time?: string;
  /** Meta's own broadcast status (LIVE/LIVE_STOPPED/PROCESSING/VOD/...) —
   * requested explicitly via `fields` below so facebookLivePost.service.ts
   * can persist it into facebook_live_posts.broadcast_status. */
  status?: string;
  comments?: { summary?: { total_count?: number } };
}

/** GET /{page-id}/live_videos — covers livestreams that have ended, not only
 * ones currently live (Live Post Selection needs "recent livestreams," per
 * spec, not just what's live right now). Scoped deliberately to this edge
 * only — regular feed posts (photo/text) are out of the module's scope.
 *
 * Business requirement (2026-08-24): the primary use case is post-livestream
 * moderation — "VOD" (Meta's archived-broadcast status) is included
 * alongside "LIVE_STOPPED" so an ended livestream that's already been
 * archived is still fetched, not silently dropped. "LIVE"/"PROCESSING" stay
 * in the filter too (an in-progress broadcast is still a valid Live Post to
 * select, per the original spec — this module has no real-time moderation
 * requirement to build around, but doesn't need to hide in-progress posts
 * either).
 *
 * Paginated via `after` cursor, same shape as listAllComments below — the
 * previous version only read the first page (Graph API's default page size
 * for this edge), silently hiding older livestreams beyond it. */
export async function listLiveVideos(pageId: string, pageAccessToken: string): Promise<FacebookLiveVideo[]> {
  const videos: FacebookLiveVideo[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = {
      access_token: pageAccessToken,
      fields: "id,title,description,creation_time,status,comments.summary(true).limit(0)",
      // Current Graph API enum (confirmed via a real (#100) validation error
      // on Dev, 2026-08-24): UNPUBLISHED/LIVE/LIVE_STOPPED/PROCESSING/VOD/
      // SCHEDULED_*. There is no "LIVE_NOW" value — a currently-live
      // broadcast is just "LIVE".
      broadcast_status: "['LIVE_STOPPED','LIVE','PROCESSING','VOD']",
      limit: "100",
    };
    if (after) params.after = after;

    const result = await graphFetch<{ data: FacebookLiveVideo[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${pageId}/live_videos`,
      params
    );
    videos.push(...result.data);
    after = result.paging?.next ? result.paging?.cursors?.after : undefined;
  } while (after);

  return videos;
}

export interface FacebookPagePostData {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  /** Meta's own classification of the post (e.g. "added_photos",
   * "mobile_status_update") — free text pass-through, not an
   * application-invented enum. */
  status_type?: string;
  comments?: { summary?: { total_count?: number } };
  reactions?: { summary?: { total_count?: number } };
  /** Omitted by Graph API entirely when the post has zero shares — never a
   * literal `{ count: 0 }` — so this is optional, not defaulted here. */
  shares?: { count?: number };
}

/** CRM's own operational bound for one manual "Làm mới" sync of
 * /{page-id}/posts — an application-level policy choice (kept fast and
 * predictable per click), NOT a Meta-guaranteed safe number. A real
 * Connected Page's post history can be large (proven on Dev, 2026-08-25:
 * an unbounded sync walked past 2000 posts across two runs before being
 * stopped) — Content Discovery must never default to walking full history
 * on every manual trigger. Exported so callers/tests can override it
 * explicitly rather than relying on a magic default. */
export const DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES = 5;

export interface ListPagePostsResult {
  posts: FacebookPagePostData[];
  /** Number of Graph API requests actually issued this call. */
  requestCount: number;
  /** True only when this call stopped because it hit `maxPages`, not
   * because Graph ran out of pages — i.e. there is more data this call did
   * not fetch. */
  hasMore: boolean;
  /** Present only when hasMore is true — the cursor a caller would pass to
   * continue. Not persisted anywhere by this function. */
  nextCursor?: string;
}

/** GET /{page-id}/posts — a connected Page's own regular feed posts
 * (Content Discovery Foundation, Phase 2A). Every field requested below was
 * verified against a real Connected Page on Dev before this function was
 * written (2026-08-25 capability proof) — none is guessed from
 * documentation alone. Paginated via `after` cursor, same shape as
 * listLiveVideos/listAllComments above, but bounded by `maxPages` — this is
 * the one edge in this file that does NOT walk to exhaustion by default,
 * because a Page's own post history has no bound this application can
 * assume is small. Deliberately scoped to this edge only — Live Videos
 * stay listLiveVideos' responsibility; this file's own one-function-per-edge
 * convention (see the module docstring at the top) applies here too. */
export async function listPagePosts(
  pageId: string,
  pageAccessToken: string,
  maxPages: number = DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES
): Promise<ListPagePostsResult> {
  const posts: FacebookPagePostData[] = [];
  let after: string | undefined;
  let requestCount = 0;

  for (;;) {
    const params: Record<string, string> = {
      access_token: pageAccessToken,
      fields:
        "id,message,created_time,permalink_url,full_picture,status_type,comments.summary(true).limit(0),reactions.summary(true).limit(0),shares",
      limit: "100",
    };
    if (after) params.after = after;

    const result = await graphFetch<{
      data: FacebookPagePostData[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${pageId}/posts`, params);
    requestCount++;
    posts.push(...result.data);

    const nextCursor = result.paging?.next ? result.paging?.cursors?.after : undefined;
    if (!nextCursor) {
      return { posts, requestCount, hasMore: false };
    }
    if (requestCount >= maxPages) {
      return { posts, requestCount, hasMore: true, nextCursor };
    }
    after = nextCursor;
  }
}

export interface FacebookComment {
  id: string;
}

/** GET /{live-video-id}/comments, paginated via `after` cursor — the full
 * comment id list is snapshotted into facebook_hide_comment_logs when a hide
 * job is created (facebookHideJob.service.ts), so this only runs once per
 * job, not once per polling round. */
export async function listAllComments(objectId: string, pageAccessToken: string): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = {
      access_token: pageAccessToken,
      fields: "id",
      filter: "stream",
      limit: "100",
    };
    if (after) params.after = after;

    const result = await graphFetch<{ data: FacebookComment[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${objectId}/comments`,
      params
    );
    ids.push(...result.data.map((c) => c.id));
    after = result.paging?.next ? result.paging?.cursors?.after : undefined;
  } while (after);

  return ids;
}

export interface FacebookLivePostCommentData {
  id: string;
  from?: { id: string; name: string };
  message?: string;
  created_time?: string;
}

/** GET /{live-video-id}/comments with full content fields — the review-
 * cache counterpart to listAllComments' ID-only fetch above (Phase 3
 * foundation, 2026-08-24: comments are only processed after a livestream
 * ends, so an Admin needs to actually read comment content before
 * deciding what to hide). Same pagination shape (after-cursor, 100/page)
 * as listAllComments, which stays completely unchanged — the hide-job
 * flow only ever needs IDs and shouldn't pay for author/message payload
 * it never reads, so this is a deliberately separate function rather
 * than adding fields there. */
export async function listLivePostComments(objectId: string, pageAccessToken: string): Promise<FacebookLivePostCommentData[]> {
  const comments: FacebookLivePostCommentData[] = [];
  let after: string | undefined;

  do {
    const params: Record<string, string> = {
      access_token: pageAccessToken,
      fields: "id,from,message,created_time",
      filter: "stream",
      limit: "100",
    };
    if (after) params.after = after;

    const result = await graphFetch<{
      data: FacebookLivePostCommentData[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(`/${objectId}/comments`, params);

    comments.push(...result.data);
    after = result.paging?.next ? result.paging?.cursors?.after : undefined;
  } while (after);

  return comments;
}

const EVIDENCE_COMMENT_FETCH_LIMIT = 100;

export interface FacebookBoundedCommentsResult {
  comments: FacebookLivePostCommentData[];
  /** true when Graph API's own paging.next indicates more comments exist
   * beyond this single fetched page — the caller (Phase 2F evidence
   * reconciliation) must treat this as "sample incomplete," never as
   * grounds for a false Not Found. */
  hasMore: boolean;
}

/** Single bounded GET /{objectId}/comments — deliberately NOT
 * auto-paginating, unlike listAllComments/listLivePostComments above. Built
 * for Phase 2F's evidence reconciliation, which must never scan a post's
 * full comment history (module scope: "bounded pagination... no unbounded
 * history scan"). Same fields/filter as listLivePostComments (id, from,
 * message, created_time; filter=stream) — reuses that shape rather than
 * inventing a new one. */
export async function getPostCommentsBoundedSample(
  objectId: string,
  pageAccessToken: string,
  limit: number = EVIDENCE_COMMENT_FETCH_LIMIT
): Promise<FacebookBoundedCommentsResult> {
  const result = await graphFetch<{
    data: FacebookLivePostCommentData[];
    paging?: { cursors?: { after?: string }; next?: string };
  }>(`/${objectId}/comments`, {
    access_token: pageAccessToken,
    fields: "id,from,message,created_time",
    filter: "stream",
    limit: String(limit),
  });
  return { comments: result.data, hasMore: !!result.paging?.next };
}

export interface HideCommentResult {
  commentId: string;
  success: boolean;
  errorMessage?: string;
  requiresReconnect?: boolean;
}

/** POST /{comment-id}?is_hidden=true for every id, via one Graph API Batch
 * Request (https://developers.facebook.com/docs/graph-api/batch-requests) —
 * up to 50 subrequests per call, which is why facebookHideJob.service.ts
 * caps a single polling round's batch size at 20 (comfortably under the
 * batch limit with headroom, and small enough that one poll round stays
 * well inside a serverless function's execution window). */
export async function hideCommentsBatch(commentIds: string[], pageAccessToken: string): Promise<HideCommentResult[]> {
  if (commentIds.length === 0) return [];
  if (commentIds.length > 50) {
    throw new Error(`hideCommentsBatch: ${commentIds.length} exceeds Graph API's 50-subrequest batch limit`);
  }

  const batch = commentIds.map((id) => ({ method: "POST", relative_url: `${id}?is_hidden=true` }));

  const url = new URL(`${GRAPH_API_BASE}/`);
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      access_token: pageAccessToken,
      batch: JSON.stringify(batch),
    }).toString(),
  });

  if (!response.ok) {
    throw new FacebookGraphError(`Batch hide request failed (${response.status})`);
  }

  const subresponses = (await response.json()) as Array<{
    code: number;
    body: string;
  }>;

  return commentIds.map((commentId, index) => {
    const sub = subresponses[index];
    if (!sub) {
      return { commentId, success: false, errorMessage: "No response for this comment in batch" };
    }
    if (sub.code >= 200 && sub.code < 300) {
      return { commentId, success: true };
    }
    const parsed = JSON.parse(sub.body || "{}") as GraphErrorBody;
    const err = new FacebookGraphError(
      parsed.error?.message ?? `Hide failed (${sub.code})`,
      parsed.error?.code,
      parsed.error?.error_subcode
    );
    return { commentId, success: false, errorMessage: err.message, requiresReconnect: err.requiresReconnect };
  });
}

/** GET /{comment-id}?fields=is_hidden — read-only verification, used by
 * facebookHideJob.service.ts's processNextBatch when a hideCommentsBatch
 * subresponse reports failure. Proven on Dev (2026-08-25, Case B
 * diagnosis): the Batch API's POST {id}?is_hidden=true subrequest can
 * return a non-2xx code with a generic body even though is_hidden was
 * actually set to true — a real Graph Batch-endpoint quirk, not something
 * predictable from the request side. Returns `true`/`false` only when
 * Graph gives a definite answer; `null` on any error or missing field —
 * callers must treat `null` as "not confirmed," never as either state. */
export async function getCommentHiddenStatus(commentId: string, pageAccessToken: string): Promise<boolean | null> {
  try {
    const result = await graphFetch<{ id: string; is_hidden?: boolean }>(`/${commentId}`, {
      access_token: pageAccessToken,
      fields: "is_hidden",
    });
    return typeof result.is_hidden === "boolean" ? result.is_hidden : null;
  } catch {
    return null;
  }
}

export interface CreatedComment {
  id: string;
}

/** POST /{object-id}/comments — publishes a comment as the Page (Phase
 * 2K-BK, Semi Seeding's direct-publish feature). Requires
 * `pages_manage_posts` (Advanced Access, App Review) on the Page Access
 * Token — this project's Meta App is currently only approved for
 * `pages_show_list` / `pages_read_engagement` / `pages_manage_engagement`
 * (see docs/FACEBOOK_COMMENT_SHIELD_META_APP_SETUP.md); calling this
 * before that separate approval exists will surface as a genuine
 * FacebookGraphError (permission denied), which the caller MUST treat as
 * a real failure — never caught-and-ignored the way
 * getCommentHiddenStatus above does for its own read-only, best-effort
 * use case. Page-only by design: no equivalent exists for Personal or
 * Group content (see the 2K-BK feasibility audit — no Graph API path is
 * officially supported for either). */
export async function createComment(objectId: string, message: string, pageAccessToken: string): Promise<CreatedComment> {
  const result = await graphFetch<{ id?: string }>(`/${objectId}/comments`, { access_token: pageAccessToken, message }, { method: "POST" });
  if (!result.id) {
    throw new Error("Graph API did not return a comment id");
  }
  return { id: result.id };
}
