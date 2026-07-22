import { NextResponse } from "next/server";
import { OrderNotFoundError, OrderRuleViolationError, OrderValidationError } from "@/lib/orders/order.service";
import { OrderRepositoryError } from "@/lib/orders/order.repository";

/** Maps the Service/Repository layers' typed errors to HTTP responses —
 * shared across every Orders API route so each route file only needs a
 * single catch/handleOrderServiceError, not its own status-code mapping.
 * `requestId` is observability-only (logged, never returned in the
 * response body) — callers that don't pass one still get a fresh id per
 * call, so this stays backward-compatible with existing call sites. */
export function handleOrderServiceError(error: unknown, requestId: string = crypto.randomUUID()): NextResponse {
  if (error instanceof OrderNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof OrderValidationError) {
    return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 400 });
  }
  if (error instanceof OrderRuleViolationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof OrderRepositoryError) {
    const code = error.cause.code;
    console.error("OrderRepositoryError", {
      operation: error.operation,
      table: error.table,
      requestId,
      postgrestCode: code?.startsWith("PGRST") ? code : null,
      sqlstate: code && !code.startsWith("PGRST") ? code : null,
      message: error.cause.message,
      details: error.cause.details ?? null,
      hint: error.cause.hint ?? null,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.error("Unexpected error in Orders API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
