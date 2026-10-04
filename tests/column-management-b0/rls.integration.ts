import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Phase 1.6 Wave B0 - report_column_preferences row-ownership RLS, against the DEV project with two real QA accounts
// (OWNER and MANAGER) and the anonymous role, talking to PostgREST directly (no API route in between).
// Run explicitly (it is not named *.test.ts so the normal unit run never touches Dev):
//   node --env-file=.env.local --env-file=.env.test --import tsx --test tests/column-management-b0/rls.integration.ts
// Only touches report_key = "commission_aging" rows that THIS run creates for the OWNER account, and removes only those.

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const KEY = "commission_aging";
const T = "report_column_preferences";

async function signIn(role: "OWNER" | "MANAGER"): Promise<SupabaseClient> {
  const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email: process.env[`QA_${role}_EMAIL`]!, password: process.env[`QA_${role}_PASSWORD`]! });
  assert.ifError(error);
  return c;
}

let a: SupabaseClient;
let b: SupabaseClient;
let anon: SupabaseClient;
let staffA: string;
let staffB: string;
let createdRowId: string | null = null;

before(async () => {
  assert.ok(URL_.includes("oupgqelswtlvipdhvvmj"), "must run against the DEV project only");
  a = await signIn("OWNER");
  b = await signIn("MANAGER");
  anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const ra = await a.rpc("report_preferences_current_staff_id");
  const rb = await b.rpc("report_preferences_current_staff_id");
  assert.ifError(ra.error);
  assert.ifError(rb.error);
  staffA = ra.data as string;
  staffB = rb.data as string;
  assert.ok(staffA && staffB && staffA !== staffB, "two distinct staff identities");
  // precondition: none of the two accounts already owns a row for the test key (never overwrite pre-existing data)
  const pre = await a.from(T).select("id").eq("report_key", KEY);
  const preB = await b.from(T).select("id").eq("report_key", KEY);
  assert.equal(pre.data?.length, 0, "OWNER has no pre-existing test-key row");
  assert.equal(preB.data?.length, 0, "MANAGER has no pre-existing test-key row");
});

after(async () => {
  if (createdRowId) await a.from(T).delete().eq("id", createdRowId); // only the row this run created, owned by OWNER
  const left = await a.from(T).select("id").eq("report_key", KEY);
  assert.equal(left.data?.length, 0, "cleanup left nothing behind");
});

test("own row: INSERT, SELECT, UPDATE work for the owner", async () => {
  const ins = await a.from(T).insert({ staff_id: staffA, report_key: KEY, visible_columns: ["salesperson"], column_order: ["salesperson", "sale_amount"] }).select("id, staff_id").single();
  assert.ifError(ins.error);
  createdRowId = ins.data!.id;
  assert.equal(ins.data!.staff_id, staffA);

  const sel = await a.from(T).select("id, visible_columns").eq("report_key", KEY);
  assert.equal(sel.data?.length, 1);

  const upd = await a.from(T).update({ visible_columns: ["salesperson", "commission_amount"] }).eq("id", createdRowId).select("id");
  assert.equal(upd.data?.length, 1);
});

test("cross-user SELECT: the other staff member sees nothing", async () => {
  const r = await b.from(T).select("id").eq("report_key", KEY);
  assert.ifError(r.error);
  assert.equal(r.data?.length, 0);
  const byId = await b.from(T).select("id").eq("id", createdRowId!);
  assert.equal(byId.data?.length, 0);
  const all = await b.from(T).select("staff_id");
  assert.ok((all.data ?? []).every((x) => x.staff_id === staffB), "only own rows are ever visible");
});

test("cross-user INSERT with someone else's staff_id is denied", async () => {
  const r = await b.from(T).insert({ staff_id: staffA, report_key: "commission_by_salesperson", visible_columns: ["salesperson"] });
  assert.ok(r.error, "insert rejected");
  assert.match(r.error!.message, /row-level security/i);
  const check = await a.from(T).select("id").eq("report_key", "commission_by_salesperson");
  assert.equal(check.data?.length, 0, "nothing was created");
});

test("cross-user UPDATE has no effect", async () => {
  const r = await b.from(T).update({ visible_columns: ["HACKED"] }).eq("id", createdRowId!).select("id");
  assert.equal(r.data?.length ?? 0, 0);
  const row = await a.from(T).select("visible_columns").eq("id", createdRowId!).single();
  assert.deepEqual(row.data!.visible_columns, ["salesperson", "commission_amount"]);
});

test("cross-user UPDATE cannot hand a row over to another staff either", async () => {
  const r = await a.from(T).update({ staff_id: staffB }).eq("id", createdRowId!).select("id");
  assert.ok(r.error || (r.data?.length ?? 0) === 0, "moving own row to another staff is rejected");
  const row = await a.from(T).select("staff_id").eq("id", createdRowId!).single();
  assert.equal(row.data!.staff_id, staffA);
});

test("cross-user DELETE has no effect", async () => {
  const r = await b.from(T).delete().eq("id", createdRowId!).select("id");
  assert.equal(r.data?.length ?? 0, 0);
  const still = await a.from(T).select("id").eq("id", createdRowId!);
  assert.equal(still.data?.length, 1, "row survived");
});

test("anonymous role: no read, no write, no delete", async () => {
  const sel = await anon.from(T).select("id");
  assert.ok(sel.error || (sel.data?.length ?? 0) === 0, "anon reads nothing");
  const ins = await anon.from(T).insert({ staff_id: staffA, report_key: KEY, visible_columns: [] });
  assert.ok(ins.error, "anon insert rejected");
  const del = await anon.from(T).delete().eq("id", createdRowId!).select("id");
  assert.ok(del.error || (del.data?.length ?? 0) === 0);
  const still = await a.from(T).select("id").eq("id", createdRowId!);
  assert.equal(still.data?.length, 1);
});

test("own DELETE works (reset) and is idempotent", async () => {
  const d1 = await a.from(T).delete().eq("id", createdRowId!).select("id");
  assert.equal(d1.data?.length, 1);
  createdRowId = null;
  const d2 = await a.from(T).delete().eq("report_key", KEY).select("id");
  assert.ifError(d2.error);
  assert.equal(d2.data?.length, 0);
});
