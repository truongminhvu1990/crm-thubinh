import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

// Phase 1.6 Wave B0 - /api/report-preferences contract: auth, ownership (staff from the session, never the body),
// whitelist, payload bounds, reset. The Supabase client is a recording fake.

let currentStaff: unknown = { id: "staff-1" };
const calls: { op: string; table: string; payload?: unknown; filters: Record<string, unknown> }[] = [];
let dbRow: Record<string, unknown> | null = null;
let failOrderColumn = false;

function builder(op: string, payload?: unknown) {
  const call = { op, table: "", payload, filters: {} as Record<string, unknown> };
  calls.push(call);
  const b: Record<string, unknown> = {};
  const self = () => b;
  b.eq = (k: string, v: unknown) => { call.filters[k] = v; return b; };
  b.select = (cols?: string) => { call.filters.__select = cols; return b; };
  const result = () => {
    const wantsOrder = typeof call.filters.__select === "string" && (call.filters.__select as string).includes("column_order");
    if (failOrderColumn && (wantsOrder || (payload && "column_order" in (payload as object)))) {
      return { data: null, error: { code: "42703", message: "column report_column_preferences.column_order does not exist" } };
    }
    if (op === "upsert") {
      const p = payload as Record<string, unknown>;
      return { data: { report_key: p.report_key, visible_columns: p.visible_columns, ...(wantsOrder ? { column_order: p.column_order } : {}), updated_at: "t" }, error: null };
    }
    return { data: dbRow, error: null };
  };
  b.single = async () => result();
  b.maybeSingle = async () => result();
  b.then = (res: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(res); // delete(): awaited directly
  void self;
  return b;
}
const fakeClient = {
  from(table: string) {
    return {
      select: (cols: string) => { const b = builder("select"); (calls[calls.length - 1] as { table: string }).table = table; (b.select as (c: string) => void)(cols); return b; },
      upsert: (row: unknown) => { const b = builder("upsert", row); (calls[calls.length - 1] as { table: string }).table = table; return b; },
      delete: () => { const b = builder("delete"); (calls[calls.length - 1] as { table: string }).table = table; return b; },
    };
  },
};

let GET: typeof import("./route").GET;
let PUT: typeof import("./route").PUT;
let DELETE: typeof import("./route").DELETE;

before(async () => {
  mock.module("@/lib/supabase", { namedExports: { supabase: {} } });
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => fakeClient } });
  mock.module("@/lib/permission/serverAuth", { namedExports: { getCurrentStaffFromRequest: async () => currentStaff } });
  const mod = await import("./route");
  ({ GET, PUT, DELETE } = mod);
});

function reset() {
  currentStaff = { id: "staff-1" };
  calls.length = 0;
  dbRow = null;
  failOrderColumn = false;
}
const put = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  new NextRequest("http://localhost/api/report-preferences", { method: "PUT", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (qs: string) => new NextRequest(`http://localhost/api/report-preferences${qs}`);
const del = (qs: string) => new NextRequest(`http://localhost/api/report-preferences${qs}`, { method: "DELETE" });

test("401 for GET / PUT / DELETE without a staff session", async () => {
  reset();
  currentStaff = null;
  assert.equal((await GET(get("?reportKey=sales_ledger"))).status, 401);
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: [] }))).status, 401);
  assert.equal((await DELETE(del("?reportKey=sales_ledger"))).status, 401);
  assert.equal(calls.length, 0, "no database access when unauthenticated");
});

test("GET own preference: queries by the session staff id and returns columnOrder", async () => {
  reset();
  dbRow = { report_key: "sales_ledger", visible_columns: ["sale_date"], column_order: ["sale_date", "order_number"], updated_at: "t" };
  const res = await GET(get("?reportKey=sales_ledger"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.preference.columnOrder, ["sale_date", "order_number"]);
  assert.equal(calls[0].filters.staff_id, "staff-1");
  assert.equal(calls[0].filters.report_key, "sales_ledger");
});

test("GET with no saved row returns preference: null", async () => {
  reset();
  assert.deepEqual(await (await GET(get("?reportKey=commission_aging"))).json(), { preference: null });
});

test("GET / DELETE reject an unknown or missing report key with 400", async () => {
  reset();
  assert.equal((await GET(get("?reportKey=consignments"))).status, 400);
  assert.equal((await GET(get(""))).status, 400);
  assert.equal((await DELETE(del("?reportKey=nope"))).status, 400);
});

test("PUT own preference (new format): staff id comes from the session, a staff_id in the body is ignored, mandatory forced", async () => {
  reset();
  const res = await PUT(put({ reportKey: "sales_ledger", staff_id: "someone-else", visibleColumns: ["order_number"], columnOrder: ["sale_date", "order_number", "product_name"] }));
  assert.equal(res.status, 200);
  const row = calls[0].payload as Record<string, unknown>;
  assert.equal(row.staff_id, "staff-1", "another user's id in the body must never be used");
  assert.deepEqual(row.column_order, ["sale_date", "order_number", "product_name"]);
  const visible = row.visible_columns as string[];
  for (const m of ["sale_date", "product_name", "sale_amount"]) assert.ok(visible.includes(m), `mandatory ${m}`);
});

test("PUT legacy payload (no columnOrder) is stored exactly as sent with column_order NULL", async () => {
  reset();
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: ["order_number"] }))).status, 200);
  const row = calls[0].payload as Record<string, unknown>;
  assert.deepEqual(row.visible_columns, ["order_number"]);
  assert.equal(row.column_order, null);
});

test("PUT rejects invalid report, unknown/duplicate/malformed columns, oversized and non-JSON bodies", async () => {
  reset();
  assert.equal((await PUT(put({ reportKey: "nope", visibleColumns: [] }))).status, 400);
  const unknown = await PUT(put({ reportKey: "sales_ledger", visibleColumns: ["sale_date", "ghost"] }));
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).code, "UNKNOWN_COLUMN");
  assert.equal((await (await PUT(put({ reportKey: "sales_ledger", visibleColumns: ["sale_date", "sale_date"] }))).json()).code, "DUPLICATE_COLUMN");
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: [1] }))).status, 400);
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: "x" }))).status, 400);
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: [], columnOrder: ["x y"] }))).status, 400);
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: Array.from({ length: 65 }, (_, i) => `c${i}`) }))).status, 400);
  const big = await PUT(put({ reportKey: "sales_ledger", visibleColumns: [], pad: "x".repeat(5000) }));
  assert.equal(big.status, 413);
  assert.equal((await PUT(put("not json"))).status, 400);
  assert.equal((await PUT(put("[]"))).status, 400);
  assert.equal((await PUT(put({ reportKey: "sales_ledger", visibleColumns: [] }, { "content-type": "text/plain" }))).status, 415);
  assert.equal(calls.length, 0, "nothing reaches the database for a rejected request");
});

test("DELETE (reset) removes only the caller's row and is idempotent", async () => {
  reset();
  for (let i = 0; i < 2; i += 1) {
    const res = await DELETE(del("?reportKey=sales_ledger"));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { preference: null });
  }
  assert.equal(calls[0].op, "delete");
  assert.equal(calls[0].filters.staff_id, "staff-1");
  assert.equal(calls[0].filters.report_key, "sales_ledger");
});

test("rollout safety: with no column_order column (pre-migration Production) GET and PUT fall back to the legacy shape", async () => {
  reset();
  failOrderColumn = true;
  dbRow = { report_key: "sales_ledger", visible_columns: ["sale_date"], updated_at: "t" };
  const g = await (await GET(get("?reportKey=sales_ledger"))).json();
  assert.equal(g.preference.columnOrder, null);
  const p = await PUT(put({ reportKey: "sales_ledger", visibleColumns: ["sale_date"], columnOrder: ["sale_date"] }));
  assert.equal(p.status, 200);
  const last = calls[calls.length - 1].payload as Record<string, unknown>;
  assert.ok(!("column_order" in last));
});
