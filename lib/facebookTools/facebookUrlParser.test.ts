import test from "node:test";
import assert from "node:assert/strict";
import { parseFacebookContentUrl, parseFacebookGroupDestinationUrl } from "./facebookUrlParser";

test("parseFacebookContentUrl: valid /posts/{id} URL parses the exact numeric object id", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/posts/1533408038784183");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "1533408038784183");
    assert.equal(result.urlShape, "posts");
  }
});

test("parseFacebookContentUrl: valid /videos/{id} URL parses correctly", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/videos/1063075290038758");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "1063075290038758");
    assert.equal(result.urlShape, "videos");
  }
});

test("parseFacebookContentUrl: valid /reel/{id} URL parses correctly", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/reel/1772531237321547/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "1772531237321547");
    assert.equal(result.urlShape, "reel");
  }
});

test("parseFacebookContentUrl: trailing slash and query params on /posts/ do not break parsing", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/posts/1533408038784183/?ref=share");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.facebookObjectId, "1533408038784183");
});

test("parseFacebookContentUrl: m.facebook.com host is accepted for a supported shape", () => {
  const result = parseFacebookContentUrl("https://m.facebook.com/1533731125418541/posts/1533408038784183");
  assert.equal(result.ok, true);
});

test("parseFacebookContentUrl: unsupported shape (permalink.php) is rejected with a clear reason, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/permalink.php?story_fbid=1533408038784183&id=1711826985696084");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /chưa được hỗ trợ/);
});

test("parseFacebookContentUrl: a real Group post URL (/groups/{group-id}/posts/{post-id}) parses successfully", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/123456789/posts/987654321/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "987654321");
    assert.equal(result.urlShape, "group-posts");
    assert.equal(result.isGroupUrl, true);
  }
});

test("parseFacebookContentUrl: a real Group permalink URL (/groups/{group-id}/permalink/{post-id}) parses successfully", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/123456789/permalink/987654321/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "987654321");
    assert.equal(result.urlShape, "group-permalink");
    assert.equal(result.isGroupUrl, true);
  }
});

test("parseFacebookContentUrl: a Group URL's parsed facebookObjectId is the post-id, never the group-id", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/111111111/posts/222222222/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.facebookObjectId, "111111111");
    assert.equal(result.facebookObjectId, "222222222");
  }
});

test("parseFacebookContentUrl: a Group URL with a non-numeric group-id is rejected, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/mua-ban-vong-tay/posts/987654321/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /chắc chắn/);
});

test("parseFacebookContentUrl: a Group URL with a non-numeric post-id is rejected, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/123456789/posts/not-a-real-id/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /chắc chắn/);
});

test("parseFacebookContentUrl: a Group URL is never guessed from an unrelated /groups/... path shape", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/groups/123456789/discover");
  assert.equal(result.ok, false);
});

test("parseFacebookContentUrl: existing /posts/{id}, /videos/{id}, /reel/{id} results now also carry isGroupUrl: false", () => {
  const posts = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/posts/1533408038784183");
  const videos = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/videos/1063075290038758");
  const reel = parseFacebookContentUrl("https://www.facebook.com/reel/1772531237321547/");
  for (const r of [posts, videos, reel]) {
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.isGroupUrl, false);
  }
});

test("parseFacebookContentUrl: non-Facebook host is rejected", () => {
  const result = parseFacebookContentUrl("https://example.com/1533731125418541/posts/1533408038784183");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /không phải là link Facebook/);
});

test("parseFacebookContentUrl: malformed URL string is rejected, not thrown", () => {
  const result = parseFacebookContentUrl("not a url at all");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /không hợp lệ/);
});

test("parseFacebookContentUrl: empty string is rejected", () => {
  const result = parseFacebookContentUrl("   ");
  assert.equal(result.ok, false);
});

test("parseFacebookContentUrl: a non-numeric id segment is never guessed as an object id", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/somepage/posts/not-a-real-id");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /chắc chắn/);
});

/** Phase 2K-BU — Personal Post Quick Capture. Share links are now a
 * genuinely supported shape (previously rejected) — the token itself is
 * read directly out of the URL path, same "never hash/guess" discipline,
 * just a weaker identity space than a canonical post id (idConfidence:
 * "share-token", documented in the file-level comment above). */
test("parseFacebookContentUrl: a share-link shape (facebook.com/share/p/{token}/) is now parsed, with idConfidence 'share-token'", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/share/p/abc123XYZ/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "abc123XYZ");
    assert.equal(result.urlShape, "share");
    assert.equal(result.idConfidence, "share-token");
  }
});

test("parseFacebookContentUrl: a /photo?fbid=...&set=... URL parses the fbid as a numeric object id", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/photo?fbid=28251318111128780&set=a.455418657812099");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "28251318111128780");
    assert.equal(result.urlShape, "photo");
    assert.equal(result.idConfidence, "numeric");
  }
});

test("parseFacebookContentUrl: a /photo URL with no fbid query param is rejected, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/photo?set=a.455418657812099");
  assert.equal(result.ok, false);
});

test("parseFacebookContentUrl: a canonical pfbid post URL (/posts/pfbid.../) is parsed with idConfidence 'pfbid', confirmed real via the 2K-BT live POC", () => {
  const result = parseFacebookContentUrl(
    "https://www.facebook.com/haozvu/posts/pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl"
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "pfbid02kaHy8WqFyHQWcygzJpSCAqA2x5484nPMSm24TbgRPVBweSfW4AbzpcVv3vnec86Vl");
    assert.equal(result.urlShape, "posts");
    assert.equal(result.idConfidence, "pfbid");
  }
});

test("parseFacebookContentUrl: existing numeric /posts/{id} results carry idConfidence 'numeric' (regression, unchanged classic shape)", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/1533731125418541/posts/1533408038784183");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.idConfidence, "numeric");
});

test("parseFacebookContentUrl: a pfbid post-id inside a Group URL is also accepted (post-id relaxation applies uniformly), but the Group id itself must still be numeric", () => {
  const withPfbidPost = parseFacebookContentUrl("https://www.facebook.com/groups/123456789/posts/pfbid02abcXYZ123/");
  assert.equal(withPfbidPost.ok, true);
  if (withPfbidPost.ok) assert.equal(withPfbidPost.idConfidence, "pfbid");

  const withPfbidGroupId = parseFacebookContentUrl("https://www.facebook.com/groups/pfbid02abcXYZ123/posts/987654321/");
  assert.equal(withPfbidGroupId.ok, false, "a Group's own id must stay strictly numeric, never relaxed to pfbid");
});

test("parseFacebookContentUrl: a share token with characters outside the confidence pattern is rejected, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/share/p/has spaces/");
  assert.equal(result.ok, false);
});

/** Phase 2K-CB (Issue 1) — a second real, confirmed share-link sub-type
 * (/share/r/, a Reel share link), reported live by a real Preview UAT
 * tester. Mirrors the /share/p/ behavior above exactly: same
 * SHARE_TOKEN_PATTERN, same "share-token" idConfidence. */
test("parseFacebookContentUrl: a share-link shape (facebook.com/share/r/{token}/) is parsed, with idConfidence 'share-token'", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/share/r/abc123XYZ/");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.facebookObjectId, "abc123XYZ");
    assert.equal(result.urlShape, "share");
    assert.equal(result.idConfidence, "share-token");
  }
});

test("parseFacebookContentUrl: a /share/r/ token with characters outside the confidence pattern is rejected, never guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/share/r/has spaces/");
  assert.equal(result.ok, false);
});

/**
 * Phase 2K-E — parseFacebookGroupDestinationUrl: destination identity is
 * always the group id, never any post id, regardless of which of the
 * real-world Group URL shapes was pasted.
 */

test("parseFacebookGroupDestinationUrl: a bare Group URL parses the group id", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/groups/555222000001/");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groupId, "555222000001");
});

test("parseFacebookGroupDestinationUrl: a /groups/{id}/posts/{post-id} URL still resolves to the group id, never the post id", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/groups/555222000001/posts/888111000002/");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groupId, "555222000001");
});

test("parseFacebookGroupDestinationUrl: a /groups/{id}/permalink/{post-id} URL still resolves to the group id", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/groups/555222000001/permalink/888111000002/");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groupId, "555222000001");
});

test("parseFacebookGroupDestinationUrl: a ?multi_permalinks= query-parameter URL still resolves to the group id (query string is irrelevant to destination identity)", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/groups/555222000001?multi_permalinks=888111000002");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.groupId, "555222000001");
});

test("parseFacebookGroupDestinationUrl: a non-numeric group id is rejected, never guessed", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/groups/mua-ban-vong-tay/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /chắc chắn/);
});

test("parseFacebookGroupDestinationUrl: a non-Group Facebook URL is rejected", () => {
  const result = parseFacebookGroupDestinationUrl("https://www.facebook.com/123/posts/456");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /không phải là link một Nhóm Facebook/);
});

test("parseFacebookGroupDestinationUrl: a non-Facebook host is rejected", () => {
  const result = parseFacebookGroupDestinationUrl("https://example.com/groups/555222000001/");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /không phải là link Facebook/);
});

test("parseFacebookGroupDestinationUrl: a malformed URL string is rejected, not thrown", () => {
  const result = parseFacebookGroupDestinationUrl("not a url at all");
  assert.equal(result.ok, false);
});

test("parseFacebookGroupDestinationUrl: an empty string is rejected", () => {
  const result = parseFacebookGroupDestinationUrl("   ");
  assert.equal(result.ok, false);
});
