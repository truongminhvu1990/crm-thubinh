import { NextRequest, NextResponse } from "next/server";
import { getCompensationPolicies, createCompensationPolicy } from "@/lib/compensation/compensation.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "compensation.view");
  if ("error" in auth) return auth.error;

  const client = await createClient();
  const policies = await getCompensationPolicies(client);
  return NextResponse.json(policies);
}

/** Policy Management (Product Owner Decision) — §13's `compensation.manage`
 * already names "configuring Policies/Types/Bases/Methods" as its scope, so
 * no new permission is introduced here. */
export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "compensation.manage");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const policy = await createCompensationPolicy(input, auth.staff.id, client);
    return NextResponse.json(policy, { status: 201 });
  } catch (error) {
    console.error("Error creating compensation policy:", error);
    return NextResponse.json({ error: "Không thể tạo Compensation Policy" }, { status: 500 });
  }
}
