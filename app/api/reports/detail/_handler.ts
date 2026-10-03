import { NextRequest, NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/permission/serverAuth";
import { ScopingStaff } from "@/lib/orders/order.repository";
import { createClient } from "@/lib/supabase/server";

// Phase 1.6 - shared gate for the read-only Reporting drawer endpoints
// (/api/reports/detail/*). `reports.view` is required; Orders data scope is
// applied inside each loader (lib/reports/entityDetail.service.ts). An id that
// is malformed, missing or out of scope is the same 404.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function handleDetailGet<T>(
  request: NextRequest,
  params: Promise<{ id: string }>,
  load: (id: string, staff: ScopingStaff, client: SupabaseClient) => Promise<T | null>
): Promise<NextResponse> {
  const auth = await requirePermission(request, "reports.view");
  if ("error" in auth) return auth.error;

  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const client = await createClient();
    const data = await load(id, auth.staff as ScopingStaff, client);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reporting detail read failed:", error);
    return NextResponse.json({ error: "Failed to load detail" }, { status: 500 });
  }
}
