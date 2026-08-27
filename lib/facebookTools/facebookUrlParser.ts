/** Phase 2J-D — parses a Facebook permalink URL into a stable Facebook
 * object id, for the manual batch-import workflow (Personal/Group content
 * the CRM has no API access to discover). Deliberately conservative: only
 * the URL shapes below are parsed with confidence. Everything else is
 * rejected with an honest, specific reason — never guessed, never a
 * best-effort partial parse. The object id is always read directly out of
 * the URL's own path segments, never derived by hashing the URL text (a
 * hash is not Facebook's stable identity and would break dedup against
 * anything the API-sync path ever discovers for the same content).
 *
 * Supported shapes (confirmed unambiguous, matching the exact real URL
 * shapes already proven this project — Phase 2I's own stored
 * permalink_url samples):
 *   https://www.facebook.com/{page-or-profile-id}/posts/{object-id}
 *   https://www.facebook.com/{page-or-profile-id}/videos/{object-id}
 *   https://www.facebook.com/reel/{object-id}
 *
 * Phase 2J-D1 — real Facebook Group post permalinks, previously a
 * documented gap, are now genuinely supported:
 *   https://www.facebook.com/groups/{group-id}/posts/{post-id}
 *   https://www.facebook.com/groups/{group-id}/permalink/{post-id}
 * Unlike the Page/Profile shapes above, {group-id} is required to be
 * numeric too, not just {post-id} — a Facebook Group's permalink path
 * segment is always a numeric group id (no vanity-username form exists
 * for this specific URL shape, unlike a Page/Profile's leading segment,
 * which legitimately can be a vanity username and is deliberately left
 * unchecked). Requiring both keeps the same "never guess" confidence bar
 * for a shape this parser has no other way to disambiguate from a
 * malformed or unrelated /groups/... path. `isGroupUrl` on a successful
 * result lets a caller (the source_type-vs-URL cross-check in
 * facebookManualContent.service.ts) tell a real Group permalink apart
 * from a Page/Profile/reel one without re-deriving it from `urlShape`. */

const SUPPORTED_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]);

/** Facebook's own object ids, in every URL sample seen across this
 * project's real Dev data, are purely numeric strings — requiring that
 * shape is the confidence check: anything else in the id position means
 * this isn't a URL we can parse with certainty. */
const OBJECT_ID_PATTERN = /^\d+$/;

export type ParseFacebookUrlResult =
  | { ok: true; facebookObjectId: string; urlShape: "posts" | "videos" | "reel" | "group-posts" | "group-permalink"; isGroupUrl: boolean }
  | { ok: false; reason: string };

export function parseFacebookContentUrl(rawUrl: string): ParseFacebookUrlResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { ok: false, reason: "URL trống" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "URL không hợp lệ" };
  }

  if (!SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: "URL không phải là link Facebook" };
  }

  // Strip a trailing slash so "/posts/123" and "/posts/123/" behave
  // identically — query string and hash are already excluded (url.pathname).
  const path = url.pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length === 3 && (segments[1] === "posts" || segments[1] === "videos")) {
    const objectId = segments[2];
    if (!OBJECT_ID_PATTERN.test(objectId)) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return { ok: true, facebookObjectId: objectId, urlShape: segments[1] as "posts" | "videos", isGroupUrl: false };
  }

  if (segments.length === 2 && segments[0] === "reel") {
    const objectId = segments[1];
    if (!OBJECT_ID_PATTERN.test(objectId)) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return { ok: true, facebookObjectId: objectId, urlShape: "reel", isGroupUrl: false };
  }

  if (segments.length === 4 && segments[0] === "groups" && (segments[2] === "posts" || segments[2] === "permalink")) {
    const groupId = segments[1];
    const objectId = segments[3];
    if (!OBJECT_ID_PATTERN.test(groupId) || !OBJECT_ID_PATTERN.test(objectId)) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return {
      ok: true,
      facebookObjectId: objectId,
      urlShape: segments[2] === "posts" ? "group-posts" : "group-permalink",
      isGroupUrl: true,
    };
  }

  return {
    ok: false,
    reason: "Dạng URL này chưa được hỗ trợ (chỉ hỗ trợ /posts/{id}, /videos/{id}, /reel/{id}, /groups/{id}/posts/{id}, /groups/{id}/permalink/{id})",
  };
}
