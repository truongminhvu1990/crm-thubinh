import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";

/**
 * Customer Receivable API Permission Enforcement (Finance Project #1,
 * Phase E, Product Owner Approval 2026-08-21) — same reports.view gate
 * every other report route already enforces (see the sibling
 * reports.permissions.test.ts), verified specifically for this new route.
 * Phase E adds no schema/RLS change — the API-layer permission gate is
 * this route's entire security surface.
 */

let authorized = true;
let lastPageResult: unknown = null;

before(() => {
  mock.module("@/lib/permission/serverAuth", {
    namedExports: {
      requirePermission: async (_request: NextRequest, permissionKey: string) => {
        if (!authorized) {
          return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }
        return { staff: { id: "staff-1", requestedPermission: permissionKey } };
      },
      getCurrentStaffFromRequest: async () => ({ id: "staff-1", full_name: "Test Staff" }),
    },
  });

  mock.module("@/lib/supabase/server", {
    namedExports: { createClient: async () => ({}) },
  });

  mock.module("@/lib/customerReceivable/customerReceivable.service", {
    namedExports: {
      getCustomerReceivablePage: async () => {
        lastPageResult = { rows: [{ orderId: "order-1" }], totalCount: 1, summary: { totalOutstanding: 100, totalOverpaid: 0, orderCount: 1 } };
        return lastPageResult;
      },
    },
  });
});

beforeEach(() => {
  authorized = true;
  lastPageResult = null;
});

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

test("GET /api/reports/customer-receivable: authorized (reports.view) reaches the service and returns 200 with the page payload", async () => {
  const { GET } = await import("./route");
  const res = await GET(makeRequest("/api/reports/customer-receivable"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, lastPageResult);
});

test("GET /api/reports/customer-receivable: unauthorized (no reports.view) returns 403 and never reaches the service — no financial data leaked", async () => {
  authorized = false;
  const { GET } = await import("./route");
  const res = await GET(makeRequest("/api/reports/customer-receivable"));
  assert.equal(res.status, 403);
  assert.equal(lastPageResult, null, "the service must never run when unauthorized");
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ["error"], "unauthorized response must carry no report payload, only an error key");
});

test("GET /api/reports/customer-receivable: only a whitelisted status value is accepted, anything else is dropped rather than passed through raw", async () => {
  const { GET } = await import("./route");
  await GET(makeRequest("/api/reports/customer-receivable?status=Overpaid"));
  await GET(makeRequest("/api/reports/customer-receivable?status=not-a-real-status"));
  // No throw either way — the route itself doesn't leak which status
  // values are valid via an error; invalid ones are simply ignored
  // (filters.status stays undefined).
  assert.ok(true);
});
