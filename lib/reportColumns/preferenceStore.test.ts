import test from "node:test";
import assert from "node:assert/strict";
import { DRAG_DEBOUNCE_MS, PreferenceStore } from "./preferenceStore";

// Phase 1.6 Wave B0 - save model: GET once, immediate / debounced / preview saves, coalescing, rollback + retry,
// reset = DELETE, server response authoritative, user isolation by store instance.

interface Req { url: string; method: string; body?: unknown }
function fakeServer(opts: { failNext?: number; serverRow?: unknown } = {}) {
  const reqs: Req[] = [];
  let fail = opts.failNext ?? 0;
  let row: unknown = opts.serverRow ?? null;
  let release: (() => void) | null = null;
  let hold = false;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    reqs.push({ url, method, body });
    if (hold) await new Promise<void>((r) => (release = r));
    if (fail > 0) { fail -= 1; return new Response("{}", { status: 500 }); }
    if (method === "PUT") row = { reportKey: body.reportKey, visibleColumns: [...body.visibleColumns, "FORCED"], columnOrder: body.columnOrder };
    if (method === "DELETE") row = null;
    return new Response(JSON.stringify({ preference: row }), { status: 200 });
  };
  return { reqs, fetchFn, holdNext() { hold = true; }, releaseOne() { hold = false; release?.(); } };
}
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const S = (visible: string[] | null, order: string[] | null) => ({ visible, order });

test("load: one GET per key even when called twice; loaded state exposes the stored columns", async () => {
  const s = fakeServer({ serverRow: { visibleColumns: ["a"], columnOrder: ["a", "b"] } });
  const store = new PreferenceStore(s.fetchFn);
  await Promise.all([store.load("r"), store.load("r")]);
  await store.load("r");
  assert.equal(s.reqs.length, 1);
  assert.deepEqual(store.get("r").working, S(["a"], ["a", "b"]));
  assert.equal(store.get("r").loaded, true);
});

test("load failure leaves registry defaults in effect and reports error=load", async () => {
  const s = fakeServer({ failNext: 1 });
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  assert.equal(store.get("r").error, "load");
  assert.deepEqual(store.get("r").working, S(null, null));
});

test("toggle saves immediately; the server response (with forced mandatory column) becomes authoritative", async () => {
  const s = fakeServer();
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(["a"], ["a", "b"]), "now");
  assert.deepEqual(store.get("r").working, S(["a"], ["a", "b"]), "optimistic");
  await tick();
  const put = s.reqs.find((r) => r.method === "PUT");
  assert.deepEqual(put?.body, { reportKey: "r", visibleColumns: ["a"], columnOrder: ["a", "b"] });
  assert.deepEqual(store.get("r").working.visible, ["a", "FORCED"]);
  assert.equal(store.get("r").saved, true);
});

test("preview (drag) updates locally with no request, then ONE request on commit", async () => {
  const s = fakeServer();
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(["a"], ["b", "a"]), "preview");
  store.set("r", S(["a"], ["b", "c", "a"]), "preview");
  store.set("r", S(["a"], ["c", "b", "a"]), "preview");
  await tick(20);
  assert.equal(s.reqs.filter((r) => r.method === "PUT").length, 0);
  store.commitPreview("r");
  await tick(20);
  const puts = s.reqs.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 1);
  assert.deepEqual((puts[0].body as { columnOrder: string[] }).columnOrder, ["c", "b", "a"]);
});

test("cancelPreview restores the pre-drag order and sends nothing", async () => {
  const s = fakeServer({ serverRow: { visibleColumns: ["a"], columnOrder: ["a", "b"] } });
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(["a"], ["b", "a"]), "preview");
  store.cancelPreview("r");
  await tick(20);
  assert.deepEqual(store.get("r").working.order, ["a", "b"]);
  assert.equal(s.reqs.filter((r) => r.method !== "GET").length, 0);
});

test("debounced changes (keyboard moves) collapse into a single save", async () => {
  const s = fakeServer();
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(["a"], ["b", "a"]), "debounce");
  store.set("r", S(["a"], ["b", "c", "a"]), "debounce");
  store.set("r", S(["a"], ["c", "b", "a"]), "debounce");
  await tick(DRAG_DEBOUNCE_MS + 150);
  const puts = s.reqs.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 1);
  assert.deepEqual((puts[0].body as { columnOrder: string[] }).columnOrder, ["c", "b", "a"]);
});

test("only one request in flight: a change made meanwhile is sent afterwards, the latest state wins", async () => {
  const s = fakeServer();
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  s.holdNext();
  store.set("r", S(["a"], ["a", "b"]), "now");
  await tick(5);
  store.set("r", S(["a", "b"], ["a", "b"]), "now");
  await tick(5);
  assert.equal(s.reqs.filter((r) => r.method === "PUT").length, 1, "second change waits");
  s.releaseOne();
  await tick(30);
  const puts = s.reqs.filter((r) => r.method === "PUT");
  assert.equal(puts.length, 2);
  assert.deepEqual((puts[1].body as { visibleColumns: string[] }).visibleColumns, ["a", "b"]);
});

test("failed save rolls back to the last confirmed state, shows error=save, and retry re-sends", async () => {
  const f = fakeServer({ serverRow: { visibleColumns: ["a", "b"], columnOrder: ["a", "b"] } });
  let calls = 0;
  const flaky = async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") { calls += 1; if (calls === 1) return new Response("{}", { status: 500 }); }
    return f.fetchFn(url, init);
  };
  const st = new PreferenceStore(flaky);
  await st.load("r");
  st.set("r", S(["a"], ["a", "b"]), "now");
  await tick(20);
  assert.equal(st.get("r").error, "save");
  assert.deepEqual(st.get("r").working.visible, ["a", "b"], "rolled back");
  st.retry("r");
  await tick(20);
  assert.equal(st.get("r").error, null);
  assert.equal(st.get("r").saved, true);
  assert.deepEqual(st.get("r").working.order, ["a", "b"]);
});

test("reset is a DELETE and returns the entry to registry defaults; repeating it is harmless", async () => {
  const s = fakeServer({ serverRow: { visibleColumns: ["a"], columnOrder: ["b", "a"] } });
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(null, null), "now");
  await tick(20);
  store.set("r", S(null, null), "now");
  await tick(20);
  const dels = s.reqs.filter((r) => r.method === "DELETE");
  assert.equal(dels.length, 2);
  assert.match(dels[0].url, /reportKey=r$/);
  assert.deepEqual(store.get("r").working, S(null, null));
});

test("a store instance is one user: clear() drops every cached preference", async () => {
  const s = fakeServer({ serverRow: { visibleColumns: ["a"], columnOrder: ["a"] } });
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.clear();
  assert.equal(store.get("r").loaded, false);
  assert.deepEqual(store.get("r").working, S(null, null));
});

test("no request other than /api/report-preferences is ever made", async () => {
  const s = fakeServer();
  const store = new PreferenceStore(s.fetchFn);
  await store.load("r");
  store.set("r", S(["a"], ["a"]), "now");
  store.set("r", S(null, null), "now");
  await tick(40);
  assert.ok(s.reqs.every((r) => r.url.startsWith("/api/report-preferences")));
});
