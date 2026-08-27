import test from "node:test";
import assert from "node:assert/strict";
import { parseFacebookContentUrl } from "./facebookUrlParser";

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

test("parseFacebookContentUrl: a share-link shape (facebook.com/share/p/{id}/) is rejected, not guessed", () => {
  const result = parseFacebookContentUrl("https://www.facebook.com/share/p/abc123XYZ/");
  assert.equal(result.ok, false);
});
