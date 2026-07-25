import { NextRequest, NextResponse } from "next/server";
import { getSalesLedgerDetail, getSalesLedgerDetailImages } from "@/lib/salesLedger/salesLedger.service";
import { createClient } from "@/lib/supabase/server";
import { getCurrentStaffFromRequest } from "@/lib/permission/serverAuth";

/** Backend API Foundation (Package 4C, Wave 3). Bundles the row + its
 * product images into one response because the Detail page already fetches
 * both together (images only when the row has a product_id) - the same
 * existing orchestration, moved server-side, not a new read.
 *
 * Hotfix 3A - see app/api/sales-ledger/route.ts's doc comment: staff is now
 * resolved via the Server Authentication Context, not the repository's
 * Browser-Authentication-Context default. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const client = await createClient();
  const staff = await getCurrentStaffFromRequest(request);
  const row = await getSalesLedgerDetail(id, client, staff);
  const images = row?.product_id ? await getSalesLedgerDetailImages(row.product_id, client) : [];

  return NextResponse.json({ row, images });
}
