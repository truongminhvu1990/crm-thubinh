import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2K-E — seeding_destinations CRUD, including URL parsing/dedup via
 * the additive parseFacebookGroupDestinationUrl (lib/facebookTools/
 * facebookUrlParser.ts). Same per-table sequenced-fake-client pattern as
 * seedingExecutionAccount.service.test.ts.
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
mock.module("@/lib/activityLog.service", { namedExports: { logActivity: async () => {} } });

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

test("createDestination: a bare Group URL is parsed into external_group_id and created", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [
      { data: null }, // existing-external_group_id lookup: nothing yet
      { data: { id: "dest-1", label: "Hội yêu đá phong thủy", external_group_id: "555222000001" } },
    ],
  });

  const result = await createDestination(
    { label: "Hội yêu đá phong thủy", permalink_url: "https://www.facebook.com/groups/555222000001/" },
    "staff-1",
    client
  );
  assert.equal(result.external_group_id, "555222000001");
});

test("createDestination: a /posts/{id} Group URL still resolves to the group id, never the post id", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [{ data: null }, { data: { id: "dest-2", external_group_id: "555222000001" } }],
  });

  const result = await createDestination(
    { label: "Nhóm A", permalink_url: "https://www.facebook.com/groups/555222000001/posts/888111000002/" },
    "staff-1",
    client
  );
  assert.equal(result.external_group_id, "555222000001");
  assert.notEqual(result.external_group_id, "888111000002");
});

test("createDestination: an invalid/malformed destination URL is rejected honestly, never guessed", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({});
  await assert.rejects(
    () => createDestination({ label: "X", permalink_url: "not a url" }, "staff-1", client),
    /URL không hợp lệ/
  );
});

test("createDestination: a non-Group Facebook URL is rejected", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({});
  await assert.rejects(
    () => createDestination({ label: "X", permalink_url: "https://www.facebook.com/123/posts/456" }, "staff-1", client),
    /không phải là link một Nhóm Facebook/
  );
});

test("createDestination: rejects a missing label before any write", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({});
  await assert.rejects(
    () => createDestination({ label: "  ", permalink_url: "https://www.facebook.com/groups/123/" }, "staff-1", client),
    /label là bắt buộc/
  );
});

test("createDestination: a duplicate external_group_id (same Group, different URL shape) is rejected, not silently re-created", async () => {
  const { createDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [{ data: { id: "existing-dest" } }], // existing-lookup finds a match
  });

  await assert.rejects(
    () =>
      createDestination(
        { label: "Nhóm trùng", permalink_url: "https://www.facebook.com/groups/555222000001/permalink/999/" },
        "staff-1",
        client
      ),
    /đã được thêm làm điểm đến trước đó/
  );
});

test("updateDestination: can deactivate a destination (status -> Inactive)", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [{ data: { id: "dest-1", label: "Nhóm A", status: "Inactive" } }],
  });

  const result = await updateDestination("dest-1", { status: "Inactive" }, "staff-1", client);
  assert.equal(result.status, "Inactive");
});

/** Phase 2K-AA — the destination edit UI writes label + permalink_url
 * through this same existing updateDestination path. */
test("updateDestination: can update the label alone", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [{ data: { id: "dest-1", label: "Tên mới", status: "Active" } }],
  });

  const result = await updateDestination("dest-1", { label: "Tên mới" }, "staff-1", client);
  assert.equal(result.label, "Tên mới");
});

test("updateDestination: can update permalink_url — re-parses into a new external_group_id", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [
      { data: null }, // dedup lookup (excluding self): no conflict
      { data: { id: "dest-1", permalink_url: "https://www.facebook.com/groups/999888777/", external_group_id: "999888777" } },
    ],
  });

  const result = await updateDestination(
    "dest-1",
    { permalink_url: "https://www.facebook.com/groups/999888777/" },
    "staff-1",
    client
  );
  assert.equal(result.external_group_id, "999888777");
});

test("updateDestination: rejects an invalid/malformed permalink_url before any write", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({});
  await assert.rejects(() => updateDestination("dest-1", { permalink_url: "not a url" }, "staff-1", client), /URL không hợp lệ/);
});

test("updateDestination: rejects changing permalink_url to a Group already used by another destination", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [{ data: { id: "other-dest" } }], // dedup lookup finds a different existing record
  });

  await assert.rejects(
    () => updateDestination("dest-1", { permalink_url: "https://www.facebook.com/groups/555222000001/" }, "staff-1", client),
    /đã được thêm làm điểm đến trước đó/
  );
});

test("updateDestination: re-saving the destination's own current permalink_url is allowed (excludes itself from the dedup check)", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({
    seeding_destinations: [
      { data: null }, // dedup lookup excludes dest-1's own id — finds nothing
      { data: { id: "dest-1", permalink_url: "https://www.facebook.com/groups/555222000001/", external_group_id: "555222000001" } },
    ],
  });

  const result = await updateDestination(
    "dest-1",
    { permalink_url: "https://www.facebook.com/groups/555222000001/" },
    "staff-1",
    client
  );
  assert.equal(result.external_group_id, "555222000001");
});

test("updateDestination: rejects clearing permalink_url to empty", async () => {
  const { updateDestination } = await import("./seedingDestination.service");
  const client = makeClient({});
  await assert.rejects(() => updateDestination("dest-1", { permalink_url: "  " }, "staff-1", client), /permalink_url là bắt buộc/);
});
