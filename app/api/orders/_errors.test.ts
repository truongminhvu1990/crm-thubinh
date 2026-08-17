import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";

// order.repository.ts transitively imports @/lib/supabase, which creates a
// real browser client at module load time — mocked here the same way
// every other test in this codebase avoids that (e.g.
// lib/moneyDebtLedger/moneyDebtLedger.service.test.ts), since this test
// never needs a real Supabase client.
mock.module("@/lib/supabase", { namedExports: { supabase: {} } });

/** Stage 21D — sync_payment_to_money_debt_ledger()'s new is_active guard
 * (supabase/migrations/2026081724_..._active_receiving_account_guard.sql)
 * raises a controlled business message when create_payment_with_ledger_
 * sync() is called against a retired Receiving Account. This covers only
 * the JS-side half of that fix — handleOrderServiceError()'s new branch
 * that recognizes this exact message and returns 400, instead of falling
 * through to the generic 500 every other OrderRepositoryError gets. The
 * SQL-side half (the RAISE EXCEPTION itself, and full-transaction
 * rollback) was verified live against Dev — see this stage's own report,
 * not re-derivable here since this test has no real database. */

test("handleOrderServiceError: an inactive-Receiving-Account rejection from create_payment_with_ledger_sync() maps to 400 with the clean business message, not the generic 500", async () => {
  const { OrderRepositoryError } = await import("@/lib/orders/order.repository");
  const { handleOrderServiceError } = await import("./_errors");
  const error = new OrderRepositoryError("addPayment", {
    message: "Receiving Account is inactive / Tài khoản nhận tiền đang tạm ngưng.",
    code: "23514",
  });

  const response = handleOrderServiceError(error);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error, "Receiving Account is inactive / Tài khoản nhận tiền đang tạm ngưng.");
});

test("handleOrderServiceError: every OTHER OrderRepositoryError (including a different message on the same code) still maps to the generic 500 — the new branch matches by exact message text, not by SQLSTATE alone", async () => {
  const { OrderRepositoryError } = await import("@/lib/orders/order.repository");
  const { handleOrderServiceError } = await import("./_errors");
  const error = new OrderRepositoryError("addPayment", {
    message: "some other check_violation entirely unrelated to receiving accounts",
    code: "23514",
  });

  const response = handleOrderServiceError(error);
  assert.equal(response.status, 500);
});
