import { NextRequest, NextResponse } from "next/server";
import { getPartners, createPartner } from "@/lib/partner/partner.service";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "partner.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = request.nextUrl;
  const client = await createClient();
  const partners = await getPartners(
    {
      searchTerm: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      partnerType: searchParams.get("partnerType") ?? undefined,
    },
    client
  );
  return NextResponse.json(partners);
}

export async function POST(request: NextRequest) {
  const auth = await requirePermission(request, "partner.create");
  if ("error" in auth) return auth.error;

  try {
    const input = await request.json();
    const client = await createClient();
    const partner = await createPartner(input, auth.staff.id, client);
    return NextResponse.json(partner, { status: 201 });
  } catch (error) {
    console.error("Error creating partner:", error);
    return NextResponse.json({ error: "Không thể tạo đối tác" }, { status: 500 });
  }
}
