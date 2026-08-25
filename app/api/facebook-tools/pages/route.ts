import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getConnectedPages } from "@/lib/facebookTools/facebookPage.service";
import { handleFacebookToolsError } from "../_errors";

export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const client = await createClient();
    const pages = await getConnectedPages(client);
    return NextResponse.json(pages);
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
