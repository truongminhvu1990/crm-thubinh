import test, { before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { NextRequest, NextResponse } from "next/server";

/**
 * Supplier Balance API Permission Enforcement (Finance Project #1, Phase F
 * re-scope, Product Owner Approval 2026-08-21) — gated by
 * `money_debt_ledger.view`, the same permission every other Money Debt
 * Ledger read endpoint already uses (see /api/money-debt-ledger/balance),
 * not `reports.view`. This route reads money_debt_ledger_entries, which
 * has no Data Scope dimension anywhere else in this codebase either
 * (getLedgerEntries never applies one) — this permission gate is this
 * route's entire security surface, by design, matching its source data's
 * own established pattern.
 */

let authorized = true;
let lastResult: unknown = null;

before(() => {
  mock.module("@/lib/permission/serverAuth", {
    namedExports: {
      requirePermission: async (_request: NextRequest, permissionKey: string) => {
        if (!authorized) {
          return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }
        return { staff: { id: "staff-1", requestedPermission: permissionKey } };
      },
    },
  });

  mock.module("@/lib/supabase/server", {
    namedExports: { createClient: async () => ({}) },
  });

  mock.module("@/lib/supplierBalance/supplierBalance.service", {
    namedExports: {
      getSupplierBalancePage: async () => {
        lastResult = { rows: [{ partyId: "supplier-1" }], summary: { supplierCount: 1, rowCount: 1 } };
        return lastResult;
      },
    },
  });
});

beforeEach(() => {
  authorized = true;
  lastResult = null;
});

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

test("GET /api/reports/supplier-balance: authorized (money_debt_ledger.view) reaches the service and returns 200 with the page payload", async () => {
  const { GET } = await import("./route");
  const res = await GET(makeRequest("/api/reports/supplier-balance"));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, lastResult);
});

test("GET /api/reports/supplier-balance: unauthorized (no money_debt_ledger.view) returns 403 and never reaches the service — no financial data leaked", async () => {
  authorized = false;
  const { GET } = await import("./route");
  const res = await GET(makeRequest("/api/reports/supplier-balance"));
  assert.equal(res.status, 403);
  assert.equal(lastResult, null, "the service must never run when unauthorized");
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ["error"], "unauthorized response must carry no report payload, only an error key");
});

test("GET /api/reports/supplier-balance: only a whitelisted currency value is accepted, anything else is dropped rather than passed through raw", async () => {
  const { GET } = await import("./route");
  const res1 = await GET(makeRequest("/api/reports/supplier-balance?currency=CNY"));
  const res2 = await GET(makeRequest("/api/reports/supplier-balance?currency=not-a-real-currency"));
  assert.equal(res1.status, 200);
  assert.equal(res2.status, 200, "an invalid currency value must not error the route, just be ignored as a filter");
});
