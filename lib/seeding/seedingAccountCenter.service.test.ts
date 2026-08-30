import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

/**
 * Phase 2K-BO — Seeding Account Center. Audit finding this module is
 * built on: a Seeding Execution Account (manually-operated, no
 * credential ever stored) and a connected Facebook Page (real OAuth
 * token, Direct Comment-capable) are two structurally different things —
 * this file proves neither is conflated with the other, and that
 * capability is always server-computed (never a pass-through of client
 * input, since none exists in these read paths).
 */

mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

const getConnectedPagesMock = mock.fn(async () => [] as { id: string; facebook_page_id: string; status: string }[]);
mock.module("@/lib/facebookTools/facebookPage.service", {
  namedExports: { getConnectedPages: getConnectedPagesMock },
});

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

function resetMocks() {
  getConnectedPagesMock.mock.resetCalls();
  getConnectedPagesMock.mock.mockImplementation(async () => []);
}

const ACCOUNT_1 = { id: "acc-1", display_name: "Nick A", status: "Active", assigned_staff_id: null, notes: null };
const ACCOUNT_2 = { id: "acc-2", display_name: "Nick B", status: "Inactive", assigned_staff_id: null, notes: null };

/** 1/2/3/4. derivePageCapability directly — the same function the
 * Account Center's page listing and the 2K-BK publish flow both call. */

test("derivePageCapability: (Page connected) AVAILABLE", async () => {
  const { derivePageCapability } = await import("./seedingDirectComment.service");
  assert.deepEqual(derivePageCapability({ status: "Connected" } as never), { availability: "AVAILABLE" });
});

test("derivePageCapability: (Page disconnected) UNAVAILABLE with a reason", async () => {
  const { derivePageCapability } = await import("./seedingDirectComment.service");
  const result = derivePageCapability({ status: "Disconnected" } as never);
  assert.equal(result.availability, "UNAVAILABLE");
  assert.ok(result.reason && result.reason.length > 0);
});

test("derivePageCapability: (Page reconnect required) UNAVAILABLE with a reason", async () => {
  const { derivePageCapability } = await import("./seedingDirectComment.service");
  const result = derivePageCapability({ status: "Reconnect Required" } as never);
  assert.equal(result.availability, "UNAVAILABLE");
  assert.ok(result.reason && result.reason.length > 0);
});

test("derivePageCapability: no page at all -> UNAVAILABLE, never throws", async () => {
  const { derivePageCapability } = await import("./seedingDirectComment.service");
  const result = derivePageCapability(null);
  assert.equal(result.availability, "UNAVAILABLE");
});

/** Every Execution Account is NOT_SUPPORTED — structurally, always, for
 * every account regardless of its own data (covers both a "Personal"-
 * conceptual account and a "Group"-conceptual account, since the current
 * data model has no field distinguishing them — confirmed by audit — and
 * the answer is identical either way: no credential exists, ever). */

test("getExecutionAccountsWithStats: every account is NOT_SUPPORTED for Direct Comment, with a human-readable architectural reason", async () => {
  resetMocks();
  const { getExecutionAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: [ACCOUNT_1, ACCOUNT_2] }],
    seeding_tasks: [{ data: [] }],
  });

  const result = await getExecutionAccountsWithStats(client);

  assert.equal(result.length, 2);
  for (const account of result) {
    assert.equal(account.direct_comment_capability.availability, "NOT_SUPPORTED");
    assert.ok(account.direct_comment_capability.reason && account.direct_comment_capability.reason.length > 0);
  }
});

test("getExecutionAccountsWithStats: task counts are correctly aggregated per account, by status", async () => {
  resetMocks();
  const { getExecutionAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: [ACCOUNT_1, ACCOUNT_2] }],
    seeding_tasks: [
      {
        data: [
          { execution_account_id: "acc-1", status: "Pending" },
          { execution_account_id: "acc-1", status: "Pending" },
          { execution_account_id: "acc-1", status: "Done" },
          { execution_account_id: "acc-2", status: "Failed" },
        ],
      },
    ],
  });

  const result = await getExecutionAccountsWithStats(client);
  const acc1 = result.find((a) => a.id === "acc-1")!;
  const acc2 = result.find((a) => a.id === "acc-2")!;

  assert.deepEqual(acc1.task_counts, { pending: 2, inProgress: 0, done: 1, failed: 0, skipped: 0, cancelled: 0, total: 3 });
  assert.deepEqual(acc2.task_counts, { pending: 0, inProgress: 0, done: 0, failed: 1, skipped: 0, cancelled: 0, total: 1 });
});

test("getExecutionAccountsWithStats: an account with zero tasks gets all-zero counts, not undefined/missing", async () => {
  resetMocks();
  const { getExecutionAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: [ACCOUNT_1] }],
    seeding_tasks: [{ data: [] }],
  });

  const result = await getExecutionAccountsWithStats(client);
  assert.deepEqual(result[0].task_counts, { pending: 0, inProgress: 0, done: 0, failed: 0, skipped: 0, cancelled: 0, total: 0 });
});

test("getExecutionAccountsWithStats: zero accounts returns an empty array without querying tasks", async () => {
  resetMocks();
  const { getExecutionAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({ seeding_execution_accounts: [{ data: [] }] });

  const result = await getExecutionAccountsWithStats(client);
  assert.deepEqual(result, []);
});

/** 5. Unknown/missing account safety. */

test("getExecutionAccountDetail: a nonexistent account id returns null, never throws", async () => {
  resetMocks();
  const { getExecutionAccountDetail } = await import("./seedingAccountCenter.service");
  const client = makeClient({ seeding_execution_accounts: [{ data: null }] });

  const result = await getExecutionAccountDetail("missing-id", client);
  assert.equal(result, null);
});

test("getExecutionAccountDetail: returns the account, its capability, its task list, and matching aggregated counts", async () => {
  resetMocks();
  const { getExecutionAccountDetail } = await import("./seedingAccountCenter.service");
  const tasks = [
    { id: "t1", execution_account_id: "acc-1", status: "Done", comment_text: null },
    { id: "t2", execution_account_id: "acc-1", status: "Pending", comment_text: null },
  ];
  const client = makeClient({
    seeding_execution_accounts: [{ data: ACCOUNT_1 }],
    seeding_tasks: [{ data: tasks }],
  });

  const result = await getExecutionAccountDetail("acc-1", client);

  assert.ok(result);
  assert.equal(result!.id, "acc-1");
  assert.equal(result!.direct_comment_capability.availability, "NOT_SUPPORTED");
  assert.equal(result!.tasks.length, 2);
  assert.deepEqual(result!.task_counts, { pending: 1, inProgress: 0, done: 1, failed: 0, skipped: 0, cancelled: 0, total: 2 });
});

/** Phase 2K-BZ (P2 #2) — Account Center task drill-through: each task
 * row now carries the real campaign name (never a raw id), and a legacy
 * task with no resolvable campaign gets an honest null, never a crash. */

test("getExecutionAccountDetail: (P2 #2) each task carries its real campaign_name, for the drill-through link", async () => {
  resetMocks();
  const { getExecutionAccountDetail } = await import("./seedingAccountCenter.service");
  const tasks = [
    { id: "t1", execution_account_id: "acc-1", campaign_id: "c1", status: "Done", comment_text: null, seeding_campaigns: { name: "Campaign A" } },
  ];
  const client = makeClient({
    seeding_execution_accounts: [{ data: ACCOUNT_1 }],
    seeding_tasks: [{ data: tasks }],
  });

  const result = await getExecutionAccountDetail("acc-1", client);

  assert.equal(result!.tasks[0].campaign_name, "Campaign A");
  assert.equal(result!.tasks[0].campaign_id, "c1", "campaign_id itself must still be present, unchanged");
  assert.equal((result!.tasks[0] as unknown as { seeding_campaigns?: unknown }).seeding_campaigns, undefined, "the raw embed must not leak through");
});

test("getExecutionAccountDetail: (P2 #2) a legacy task with no resolvable campaign gets campaign_name null, never a crash", async () => {
  resetMocks();
  const { getExecutionAccountDetail } = await import("./seedingAccountCenter.service");
  const tasks = [{ id: "t1", execution_account_id: "acc-1", campaign_id: "missing", status: "Pending", comment_text: null, seeding_campaigns: null }];
  const client = makeClient({
    seeding_execution_accounts: [{ data: ACCOUNT_1 }],
    seeding_tasks: [{ data: tasks }],
  });

  const result = await getExecutionAccountDetail("acc-1", client);

  assert.equal(result!.tasks[0].campaign_name, null);
});

/** 6. Server-side capability enforcement — the capability object is
 * always computed here, never accepted as input; these read functions
 * take no capability parameter at all, so there is nothing for a caller
 * to override even in principle. */

test("getExecutionAccountsWithStats: capability is identical for every account regardless of its own field values — there is no per-account data path that could ever flip it to AVAILABLE", async () => {
  resetMocks();
  const { getExecutionAccountsWithStats } = await import("./seedingAccountCenter.service");
  const weirdAccount = { id: "acc-weird", display_name: "Trang giả làm Page?", status: "Active", assigned_staff_id: null, notes: "type: Page" };
  const client = makeClient({
    seeding_execution_accounts: [{ data: [weirdAccount] }],
    seeding_tasks: [{ data: [] }],
  });

  const result = await getExecutionAccountsWithStats(client);
  assert.equal(result[0].direct_comment_capability.availability, "NOT_SUPPORTED", "no notes/display_name content can ever grant capability");
});

/** 7. Task/account association for the Page side — capability + counts
 * scoped correctly through campaigns, and per-page isolation (Page B's
 * tasks never bleed into Page A's counts). */

test("getPageAccountsWithStats: capability and task counts are correctly scoped per connected Page through its own campaigns", async () => {
  resetMocks();
  getConnectedPagesMock.mock.mockImplementationOnce(async () => [
    { id: "page-row-a", facebook_page_id: "fb-page-a", status: "Connected" },
    { id: "page-row-b", facebook_page_id: "fb-page-b", status: "Disconnected" },
  ]);
  const { getPageAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({
    seeding_campaigns: [
      {
        data: [
          { id: "camp-a", facebook_page_id: "fb-page-a" },
          { id: "camp-b", facebook_page_id: "fb-page-b" },
        ],
      },
    ],
    seeding_tasks: [
      {
        data: [
          { campaign_id: "camp-a", status: "Done" },
          { campaign_id: "camp-a", status: "Pending" },
          { campaign_id: "camp-b", status: "Failed" },
        ],
      },
    ],
  });

  const result = await getPageAccountsWithStats(client);
  const pageA = result.find((p) => p.page.facebook_page_id === "fb-page-a")!;
  const pageB = result.find((p) => p.page.facebook_page_id === "fb-page-b")!;

  assert.equal(pageA.direct_comment_capability.availability, "AVAILABLE");
  assert.deepEqual(pageA.task_counts, { pending: 1, inProgress: 0, done: 1, failed: 0, skipped: 0, cancelled: 0, total: 2 });

  assert.equal(pageB.direct_comment_capability.availability, "UNAVAILABLE");
  assert.deepEqual(pageB.task_counts, { pending: 0, inProgress: 0, done: 0, failed: 1, skipped: 0, cancelled: 0, total: 1 });
});

test("getPageAccountsWithStats: zero connected Pages returns an empty array without querying campaigns/tasks", async () => {
  resetMocks();
  const { getPageAccountsWithStats } = await import("./seedingAccountCenter.service");
  const client = makeClient({});

  const result = await getPageAccountsWithStats(client);
  assert.deepEqual(result, []);
});

test("getAccountCenterOverview: combines both account types in one call", async () => {
  resetMocks();
  getConnectedPagesMock.mock.mockImplementationOnce(async () => [{ id: "page-row-a", facebook_page_id: "fb-page-a", status: "Connected" }]);
  const { getAccountCenterOverview } = await import("./seedingAccountCenter.service");
  const client = makeClient({
    seeding_execution_accounts: [{ data: [ACCOUNT_1] }],
    seeding_tasks: [{ data: [] }],
    seeding_campaigns: [{ data: [] }],
  });

  const overview = await getAccountCenterOverview(client);
  assert.equal(overview.executionAccounts.length, 1);
  assert.equal(overview.pages.length, 1);
});
