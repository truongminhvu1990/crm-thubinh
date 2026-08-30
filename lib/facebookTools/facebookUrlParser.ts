/** Phase 2J-D — parses a Facebook permalink URL into a stable Facebook
 * object id, for the manual batch-import workflow (Personal/Group content
 * the CRM has no API access to discover). Deliberately conservative: only
 * the URL shapes below are parsed with confidence. Everything else is
 * rejected with an honest, specific reason — never guessed, never a
 * best-effort partial parse. The object id is always read directly out of
 * the URL's own path/query, never derived by hashing the URL text (a
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
 * from a Page/Profile/reel one without re-deriving it from `urlShape`.
 *
 * Phase 2K-BU — Personal Post Quick Capture adds two more real,
 * unambiguous shapes without weakening the "never guess" bar:
 *   https://www.facebook.com/photo?fbid={object-id}&set=...   (query-based)
 *   https://www.facebook.com/share/p/{share-token}/           (share link)
 * and relaxes the post-id confidence check (NOT the Group-id check, which
 * stays numeric-only) to also accept Facebook's newer `pfbid...` opaque
 * post-id format, confirmed live in the 2K-BT POC to be a real, current
 * Facebook URL id shape — not a guess, a second known-real format.
 *
 * `idConfidence` on every successful result is the deliberate answer to
 * "URL parsing certainty is NOT the same thing as Meta object ID
 * certainty" — this parser only ever claims to have read an id
 * confidently out of the URL; it makes NO claim about whether that id is
 * usable for any Graph API call. `numeric` is the classic, most certain
 * form. `pfbid` is Facebook's own opaque post-id format, read verbatim
 * from the URL, but 2K-BT already proved a pfbid id was rejected by the
 * Graph API comments endpoint for an unrelated reason (Personal-content
 * API deprecation) — this parser draws no conclusion either way about
 * pfbid's general Graph API usability, it only reports that the id was
 * confidently extracted. `share-token` is the weakest: a `/share/p/...`
 * token identifies Facebook's own redirect, not necessarily the same
 * identity space as that post's own canonical id — importing the SAME
 * post later via its canonical link will not be recognized as a
 * duplicate of a share-token-identified row. This is a known, honestly
 * reported limitation, not a bug: inventing a way to unify the two would
 * require resolving the share link (a network fetch this parser
 * deliberately never performs — see facebookManualContent.service.ts).
 *
 * Phase 2K-CB (Issue 1) — a second real, confirmed share-link sub-type,
 * https://www.facebook.com/share/r/{share-token}/, reported live by a
 * real Preview UAT tester. Same SHARE_TOKEN_PATTERN, same "share-token"
 * identity/confidence as /share/p/ above. Only "p" and "r" are accepted:
 * both have real observed evidence; no other /share/{x}/ sub-type is
 * added speculatively. */

const SUPPORTED_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com"]);

/** Facebook's own classic object ids, in every URL sample seen across
 * this project's real Dev data, are purely numeric strings. */
const OBJECT_ID_PATTERN = /^\d+$/;

/** Facebook's newer opaque post-id format (confirmed real and current via
 * the 2K-BT live POC, not a guessed pattern) — always this exact prefix. */
const PFBID_PATTERN = /^pfbid[0-9A-Za-z]+$/;

/** A `/share/p/{token}/` token — mixed-case alphanumeric, confirmed from
 * real examples seen this phase. Deliberately permissive but still a
 * confidence check: anything containing characters outside this set means
 * the path didn't cleanly segment the way a real share token does. */
const SHARE_TOKEN_PATTERN = /^[0-9A-Za-z_-]+$/;

type PostIdConfidence = "numeric" | "pfbid";

/** Shared post-id confidence check for every shape below EXCEPT the
 * share-token one (which has its own, weaker identity space entirely —
 * see the file-level doc comment). Returns null (never guessed) for
 * anything that isn't confidently one of the two known-real formats. */
function classifyPostId(id: string): PostIdConfidence | null {
  if (OBJECT_ID_PATTERN.test(id)) return "numeric";
  if (PFBID_PATTERN.test(id)) return "pfbid";
  return null;
}

export type FacebookUrlIdConfidence = PostIdConfidence | "share-token";

export type ParseFacebookUrlResult =
  | {
      ok: true;
      facebookObjectId: string;
      urlShape: "posts" | "videos" | "reel" | "group-posts" | "group-permalink" | "photo" | "share";
      isGroupUrl: boolean;
      idConfidence: FacebookUrlIdConfidence;
    }
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
    const confidence = classifyPostId(objectId);
    if (!confidence) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return {
      ok: true,
      facebookObjectId: objectId,
      urlShape: segments[1] as "posts" | "videos",
      isGroupUrl: false,
      idConfidence: confidence,
    };
  }

  if (segments.length === 2 && segments[0] === "reel") {
    const objectId = segments[1];
    const confidence = classifyPostId(objectId);
    if (!confidence) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return { ok: true, facebookObjectId: objectId, urlShape: "reel", isGroupUrl: false, idConfidence: confidence };
  }

  if (segments.length === 4 && segments[0] === "groups" && (segments[2] === "posts" || segments[2] === "permalink")) {
    const groupId = segments[1];
    const objectId = segments[3];
    const confidence = classifyPostId(objectId);
    // Group identity itself stays strictly numeric — unrelated to the
    // post-id relaxation above (see the file-level doc comment).
    if (!OBJECT_ID_PATTERN.test(groupId) || !confidence) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return {
      ok: true,
      facebookObjectId: objectId,
      urlShape: segments[2] === "posts" ? "group-posts" : "group-permalink",
      isGroupUrl: true,
      idConfidence: confidence,
    };
  }

  if (segments.length === 1 && (segments[0] === "photo" || segments[0] === "photo.php")) {
    const objectId = url.searchParams.get("fbid");
    const confidence = objectId ? classifyPostId(objectId) : null;
    if (!objectId || !confidence) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return { ok: true, facebookObjectId: objectId, urlShape: "photo", isGroupUrl: false, idConfidence: confidence };
  }

  if (segments.length === 3 && segments[0] === "share" && (segments[1] === "p" || segments[1] === "r")) {
    const shareToken = segments[2];
    if (!SHARE_TOKEN_PATTERN.test(shareToken)) {
      return { ok: false, reason: "Không xác định được ID bài viết một cách chắc chắn" };
    }
    return { ok: true, facebookObjectId: shareToken, urlShape: "share", isGroupUrl: false, idConfidence: "share-token" };
  }

  return {
    ok: false,
    reason:
      "Dạng URL này chưa được hỗ trợ (chỉ hỗ trợ /posts/{id}, /videos/{id}, /reel/{id}, /groups/{id}/posts/{id}, /groups/{id}/permalink/{id}, /photo?fbid={id}, /share/p/{id}, /share/r/{id})",
  };
}

export type ParseFacebookGroupDestinationUrlResult =
  | { ok: true; groupId: string }
  | { ok: false; reason: string };

/** Phase 2K-E — parses a Facebook Group URL into its stable, normalized
 * group id, for the seeding_destinations "which Group to post into"
 * directory. Deliberately a SEPARATE function from
 * parseFacebookContentUrl above, not a mode flag on it: that function's
 * identity target is a post id (content import, Phase 2J); this one's is
 * the group id itself, and a destination has no post id at all — a
 * destination is the Group, never any specific post inside it. Accepts
 * any `/groups/{group-id}` path, regardless of what (if anything) follows
 * it — a bare Group URL, a `/posts/{id}` or `/permalink/{id}` link, or a
 * `?multi_permalinks={id}` query-parameter link (the id after `/groups/`
 * is always in the SAME path position across all of these; only the
 * unused trailing path/query differs) — and always discards whatever
 * follows, matching the "destination identity = group id only, never a
 * post id" rule this module locks. Same "never guess" numeric confidence
 * check as parseFacebookContentUrl. */
export function parseFacebookGroupDestinationUrl(rawUrl: string): ParseFacebookGroupDestinationUrlResult {
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

  const path = url.pathname.replace(/\/+$/, "");
  const segments = path.split("/").filter(Boolean);

  if (segments.length < 2 || segments[0] !== "groups") {
    return { ok: false, reason: "URL này không phải là link một Nhóm Facebook (dạng /groups/{id})" };
  }

  const groupId = segments[1];
  if (!OBJECT_ID_PATTERN.test(groupId)) {
    return { ok: false, reason: "Không xác định được ID Nhóm một cách chắc chắn" };
  }

  return { ok: true, groupId };
}
