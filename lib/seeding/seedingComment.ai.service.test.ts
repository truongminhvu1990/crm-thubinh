import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Semi Seeding Assistant — AI Comment Suggestion (module scope §2:
 * "Nhiều biến thể", "Không trùng lặp", "Có thể regenerate"). The actual
 * Claude API call (requestSuggestionsFromClaude) is injected as a
 * parameter rather than mocked at the module level — same injectable-
 * dependency convention this codebase already uses for SupabaseClient
 * (lib/partner/partner.service.test.ts) — so these tests never touch the
 * network or require ANTHROPIC_API_KEY.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

interface FakeResult {
  data: unknown;
  error?: unknown;
}

function makeClient(perTableSequence: Record<string, FakeResult[]>) {
  const counters: Record<string, number> = {};
  return {
    from(table: string) {
      const seq = perTableSequence[table];
      if (!seq) throw new Error(`Unexpected table in test fake: ${table}`);
      const idx = counters[table] ?? 0;
      counters[table] = idx + 1;
      const result = seq[idx] ?? seq[seq.length - 1];

      const handler: ProxyHandler<object> = {
        get(_target, prop) {
          const resolved = Promise.resolve({ error: null, ...result });
          if (prop === "then") return resolved.then.bind(resolved);
          if (prop === "catch") return resolved.catch.bind(resolved);
          return () => proxy;
        },
      };
      const proxy: unknown = new Proxy({}, handler);
      return proxy;
    },
  } as never;
}

test("dedupeSuggestions: drops exact duplicates within a batch", async () => {
  const { dedupeSuggestions } = await import("./seedingComment.ai.service");
  const result = dedupeSuggestions([
    { category: "hoi_thong_tin", content: "Sản phẩm này còn hàng không shop?" },
    { category: "kien_thuc", content: "Ngọc bích tự nhiên nhìn khác đá nhân tạo thế nào nhỉ?" },
    { category: "hoi_thong_tin", content: "Sản phẩm này còn hàng không shop?" },
  ]);
  assert.equal(result.length, 2);
});

test("dedupeSuggestions: treats whitespace/case-only differences as duplicates, keeps first occurrence", async () => {
  const { dedupeSuggestions } = await import("./seedingComment.ai.service");
  const result = dedupeSuggestions([
    { category: "phan_hoi_tu_nhien", content: "Đẹp quá chị ơi" },
    { category: "phan_hoi_tu_nhien", content: "  đẹp   quá   CHỊ ƠI  " },
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].content, "Đẹp quá chị ơi");
});

test("dedupeSuggestions: distinct content across categories is never merged", async () => {
  const { dedupeSuggestions } = await import("./seedingComment.ai.service");
  const result = dedupeSuggestions([
    { category: "hoi_thong_tin", content: "Giá bao nhiêu vậy shop?" },
    { category: "tao_thao_luan", content: "Mọi người thấy màu này có hợp mùa hè không?" },
  ]);
  assert.equal(result.length, 2);
});

test("generateCommentSuggestions: rejects before ever calling the AI when the campaign doesn't exist", async () => {
  const { generateCommentSuggestions } = await import("./seedingComment.ai.service");
  const client = makeClient({ seeding_campaigns: [{ data: null }] });
  const requestFn = mock.fn(async () => {
    throw new Error("should never be called");
  });

  await assert.rejects(
    () => generateCommentSuggestions("missing-campaign", null, client, requestFn),
    /Seeding campaign not found/
  );
  assert.equal(requestFn.mock.callCount(), 0);
});

test("generateCommentSuggestions: feeds prior batches' content back as avoid-context on regenerate, persists the new batch number", async () => {
  const { generateCommentSuggestions } = await import("./seedingComment.ai.service");

  const client = makeClient({
    seeding_campaigns: [
      {
        data: {
          id: "c1",
          facebook_page_id: "p1",
          facebook_post_id: "post1",
          post_content_snapshot: "Bộ sưu tập mới về rồi cả nhà ơi",
          objective: "Tăng tương tác",
          status: "Active",
        },
      },
    ],
    seeding_comment_suggestions: [
      { data: [{ id: "s1", campaign_id: "c1", category: "hoi_thong_tin", content: "Còn hàng không shop?", generation_batch: 1 }] },
      {
        data: [
          { id: "s2", campaign_id: "c1", category: "kien_thuc", content: "Ngọc bích thật để lâu có đổi màu không nhỉ?", generation_batch: 2 },
        ],
      },
    ],
  });

  let receivedAvoid: string[] = [];
  const requestFn = mock.fn(async (input: { avoid: string[] }) => {
    receivedAvoid = input.avoid;
    return [{ category: "kien_thuc" as const, content: "Ngọc bích thật để lâu có đổi màu không nhỉ?" }];
  });

  const result = await generateCommentSuggestions("c1", null, client, requestFn);

  assert.deepEqual(receivedAvoid, ["Còn hàng không shop?"]);
  assert.equal(result.length, 1);
  assert.equal(result[0].generation_batch, 2);
});

test("generateCommentSuggestions: two AI variants that are near-duplicates collapse to one persisted row", async () => {
  const { generateCommentSuggestions } = await import("./seedingComment.ai.service");

  const client = makeClient({
    seeding_campaigns: [
      { data: { id: "c1", facebook_page_id: "p1", facebook_post_id: "post1", post_content_snapshot: null, objective: "Kéo inbox", status: "Draft" } },
    ],
    seeding_comment_suggestions: [{ data: [] }, { data: [{ id: "s1", campaign_id: "c1", category: "phan_hoi_tu_nhien", content: "Y chang", generation_batch: 1 }] }],
  });

  const requestFn = mock.fn(async () => [
    { category: "phan_hoi_tu_nhien" as const, content: "Y chang" },
    { category: "phan_hoi_tu_nhien" as const, content: "y chang" },
  ]);
  const result = await generateCommentSuggestions("c1", null, client, requestFn);
  assert.equal(result.length, 1);
});

test("generateCommentSuggestions: an empty AI response returns an empty array", async () => {
  const { generateCommentSuggestions } = await import("./seedingComment.ai.service");

  const client = makeClient({
    seeding_campaigns: [
      { data: { id: "c1", facebook_page_id: "p1", facebook_post_id: "post1", post_content_snapshot: null, objective: "Kéo inbox", status: "Draft" } },
    ],
    seeding_comment_suggestions: [{ data: [] }],
  });

  const requestFn = mock.fn(async () => []);
  const result = await generateCommentSuggestions("c1", null, client, requestFn);
  assert.equal(result.length, 0);
});
