import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ACCESS, AccessSnapshot, createAccessLoader, decideAccess, isOwnerOrManager } from "./accessLoader";

const owner: AccessSnapshot = { roleKey: "Owner", permissionKeys: new Set(["reports.view", "orders.view"]) };
const sales: AccessSnapshot = { roleKey: "Sales", permissionKeys: new Set(["orders.view"]) };

function setup(initialUser: string | null = "u1") {
  let user = initialUser;
  let clock = 1_000;
  let fetches = 0;
  let answer: AccessSnapshot = owner;
  let failNext = false;
  let release: (() => void) | null = null;
  let hold = false;
  const loader = createAccessLoader({
    sessionUserId: async () => user,
    fetchAccess: async () => {
      fetches += 1;
      if (hold) await new Promise<void>((r) => (release = r));
      if (failNext) {
        failNext = false;
        throw new Error("network down");
      }
      return answer;
    },
    now: () => clock,
    ttlMs: 60_000,
  });
  return {
    loader,
    fetches: () => fetches,
    setUser: (u: string | null) => (user = u),
    advance: (ms: number) => (clock += ms),
    setAnswer: (a: AccessSnapshot) => (answer = a),
    failNext: () => (failNext = true),
    holdFetch: () => (hold = true),
    releaseFetch: () => {
      hold = false;
      release?.();
    },
  };
}

test("decideAccess / isOwnerOrManager: only an explicit grant allows; missing snapshot denies", () => {
  assert.equal(decideAccess(owner, "reports.view"), "allowed");
  assert.equal(decideAccess(sales, "reports.view"), "denied");
  assert.equal(decideAccess(null, "reports.view"), "denied");
  assert.equal(decideAccess(undefined, "reports.view"), "denied");
  assert.equal(decideAccess(EMPTY_ACCESS, "reports.view"), "denied");
  assert.equal(isOwnerOrManager({ roleKey: "Manager", permissionKeys: new Set() }), true);
  assert.equal(isOwnerOrManager(owner), true);
  assert.equal(isOwnerOrManager(sales), false);
  assert.equal(isOwnerOrManager(null), false);
});

test("many components asking at the same moment share ONE lookup", async () => {
  const s = setup();
  const all = await Promise.all([s.loader.get(), s.loader.get(), s.loader.get(), s.loader.get()]);
  assert.equal(s.fetches(), 1);
  for (const a of all) assert.equal(a, owner);
});

test("within the TTL the answer is reused; after it the lookup runs again", async () => {
  const s = setup();
  await s.loader.get();
  s.advance(59_000);
  await s.loader.get();
  assert.equal(s.fetches(), 1);
  s.advance(2_000);
  await s.loader.get();
  assert.equal(s.fetches(), 2);
});

test("a different signed-in user NEVER receives the previous user's access", async () => {
  const s = setup("u1");
  assert.equal(await s.loader.get(), owner);
  s.setUser("u2");
  s.setAnswer(sales);
  const second = await s.loader.get();
  assert.equal(second, sales);
  assert.equal(s.fetches(), 2);
});

test("nobody signed in: empty access, no lookup, nothing cached", async () => {
  const s = setup(null);
  assert.equal(await s.loader.get(), EMPTY_ACCESS);
  assert.equal(s.fetches(), 0);
});

test("clear() (sign-in / sign-out / token event) discards the cache and the in-flight answer", async () => {
  const s = setup();
  await s.loader.get();
  s.loader.clear();
  await s.loader.get();
  assert.equal(s.fetches(), 2);

  const s2 = setup();
  s2.holdFetch();
  const pending = s2.loader.get();
  await new Promise((r) => setTimeout(r, 5));
  s2.loader.clear(); // identity changed while the lookup was running
  s2.releaseFetch();
  await pending;
  await s2.loader.get(); // the stale answer must not have been cached
  assert.equal(s2.fetches(), 2);
});

test("a failed lookup is not cached: the next caller retries and succeeds", async () => {
  const s = setup();
  s.failNext();
  await assert.rejects(() => s.loader.get(), /network down/);
  assert.equal(await s.loader.get(), owner);
  assert.equal(s.fetches(), 2);
});

test("concurrent callers of a failing lookup all see the failure, then a later call recovers", async () => {
  const s = setup();
  s.failNext();
  const results = await Promise.allSettled([s.loader.get(), s.loader.get()]);
  assert.deepEqual(results.map((r) => r.status), ["rejected", "rejected"]);
  assert.equal(s.fetches(), 1);
  assert.equal(await s.loader.get(), owner);
});
