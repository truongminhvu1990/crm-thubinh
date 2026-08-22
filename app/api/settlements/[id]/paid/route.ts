import { NextRequest, NextResponse } from "next/server";
import { markSettlementPaid, SettlementRuleViolationError } from "@/lib/settlement/settlement.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** Completed -> Paid (Finance Project #1, Phase A, Product Owner Approval
 * 2026-08-21). Requires payment_reference + receiving_account_id — proves
 * Compensation -> Handed Off -> Paid -> Payment Reference, not just a bare
 * status flip. The actual write goes through mark_settlement_paid() (see
 * lib/settlement/settlement.service.ts) — this route's own requirePermission
 * check is defense-in-depth alongside the RPC's own independent
 * settlement.manage re-verification, not the only gate. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "settlement.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  try {
    const body = await request.json();
    const paymentReference = typeof body.payment_reference === "string" ? body.payment_reference.trim() : "";
    const receivingAccountId = typeof body.receiving_account_id === "string" ? body.receiving_account_id : "";

    if (!paymentReference) {
      return NextResponse.json({ error: "Vui lòng nhập payment reference" }, { status: 400 });
    }
    if (!receivingAccountId) {
      return NextResponse.json({ error: "Vui lòng chọn tài khoản nhận tiền" }, { status: 400 });
    }

    const client = await createClient();
    const settlement = await markSettlementPaid(id, auth.staff.id, paymentReference, receivingAccountId, client);
    return NextResponse.json(settlement);
  } catch (error) {
    if (error instanceof SettlementRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error marking settlement paid:", error);
    return NextResponse.json({ error: "Không thể đánh dấu đã thanh toán" }, { status: 500 });
  }
}
