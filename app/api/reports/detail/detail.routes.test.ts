import test, { before, mock } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";

/** Phase 1.6 - the four /api/reports/detail/* routes share one gate:
 * reports.view required (403 otherwise), malformed id = 404, loader null = 404. */

let authorized = true;
const seen: { permission?: string; id?: string; calls: number } = { calls: 0 };
const UUID = "3f2c1a40-8b1e-4c7a-9d55-0a1b2c3d4e5f";

before(() => {
  mock.module("@/lib/permission/serverAuth", {
    namedExports: {
      requirePermission: async (_r: NextRequest, key: string) => {
        seen.permission = key;
        return authorized ? { staff: { id: "s1", full_name: "A" } } : { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
      },
    },
  });
  mock.module("@/lib/supabase/server", { namedExports: { createClient: async () => ({}) } });
  const loader = async (id: string) => {
    seen.calls += 1;
    seen.id = id;
    return id === UUID ? { ok: true } : null;
  };
  mock.module("@/lib/reports/entityDetail.service", {
    namedExports: {
      getOrderDrawerData: loader,
      getProductDrawerData: loader,
      getCustomerDrawerData: loader,
      getInventoryDrawerData: loader,
    },
  });
});

const req = () => new NextRequest("http://localhost/api/reports/detail/x");

for (const kind of ["order", "product", "customer", "inventory"]) {
  test(`${kind}: requires reports.view`, async () => {
    const { GET } = await import(`./${kind}/[id]/route`);
    authorized = false;
    seen.calls = 0;
    const res = await GET(req(), { params: Promise.resolve({ id: UUID }) });
    assert.equal(res.status, 403);
    assert.equal(seen.permission, "reports.view");
    assert.equal(seen.calls, 0, "no data read before the permission gate passes");
  });

  test(`${kind}: 200 for a found id, 404 for malformed or missing`, async () => {
    const { GET } = await import(`./${kind}/[id]/route`);
    authorized = true;
    const ok = await GET(req(), { params: Promise.resolve({ id: UUID }) });
    assert.equal(ok.status, 200);

    seen.calls = 0;
    const bad = await GET(req(), { params: Promise.resolve({ id: "not-a-uuid" }) });
    assert.equal(bad.status, 404);
    assert.equal(seen.calls, 0, "malformed id never reaches the database");

    const missing = await GET(req(), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    assert.equal(missing.status, 404);
  });
}
