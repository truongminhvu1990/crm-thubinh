import { NextRequest, NextResponse } from "next/server";
import { createConsignment, ConsignmentRuleViolationError } from "@/lib/consignment/consignment.service";
import { getConsignmentOverview } from "@/lib/consignment/consignmentOverview.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

/** `consignment.view`/`consignment.create` — Product Owner-approved,
 * narrowly-scoped exception to D12 (Blocker 1 Resolution). See
 * supabase/migrations/2026081803_consignment_permissions.sql's own header
 * for the exact evidence/decision this exception is grounded in.
 *
 * GET returns the Consignment Overview (Product Owner Reporting/Usability
 * Gap resolution) rather than the plain Consignment row — this endpoint's
 * only consumer is the Consignment list page, which needs the enriched
 * shape (Sale/Buyer/Salesperson/Financial figures) to satisfy the
 * operational-visibility requirement without a second endpoint. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "consignment.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const consignments = await getConsignmentOverview(
    {
      searchTerm: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      consignmentId: searchParams.get("consignmentId") ?? undefined,
    },
    client
  );
  return NextResponse.json(consignments);
}

/** RECEIVED — the only creation path (D9: Consignor = Customer, no new
 * identity entity). */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "consignment.create");
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();
    const client = await createClient();
    const consignment = await createConsignment(
      { customer_id: body.customer_id, product_id: body.product_id },
      auth.staff.id,
      client
    );
    return NextResponse.json(consignment, { status: 201 });
  } catch (error) {
    if (error instanceof ConsignmentRuleViolationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Error creating consignment:", error);
    return NextResponse.json({ error: "Không thể tạo consignment" }, { status: 500 });
  }
}
