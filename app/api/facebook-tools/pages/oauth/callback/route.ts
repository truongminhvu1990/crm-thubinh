import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { connectPagesFromOAuthCode } from "@/lib/facebookTools/facebookPage.service";

/** Facebook redirects the Admin's browser here after Login for Business —
 * this is a full-page navigation, not a fetch(), so results are reported
 * back via redirect query params (?fb_connect_success=1 or
 * ?fb_connect_error=...) that the Comment Shield page reads on load. */
export async function GET(request: NextRequest) {
  const redirectTo = new URL("/facebook-tools/comment-shield", request.nextUrl.origin);

  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) {
    redirectTo.searchParams.set("fb_connect_error", "forbidden");
    return NextResponse.redirect(redirectTo);
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const stateCookie = request.cookies.get("fb_oauth_state")?.value;

  if (!code || !state || !stateCookie || state !== stateCookie) {
    redirectTo.searchParams.set("fb_connect_error", "invalid_state");
    const response = NextResponse.redirect(redirectTo);
    response.cookies.delete("fb_oauth_state");
    return response;
  }

  try {
    const client = await createClient();
    const redirectUri = `${request.nextUrl.origin}/api/facebook-tools/pages/oauth/callback`;
    const connected = await connectPagesFromOAuthCode(code, redirectUri, auth.staff.id, client);
    redirectTo.searchParams.set("fb_connect_success", String(connected.length));
  } catch (error) {
    console.error("Error completing Facebook OAuth connect:", error);
    redirectTo.searchParams.set("fb_connect_error", "graph_api_error");
  }

  const response = NextResponse.redirect(redirectTo);
  response.cookies.delete("fb_oauth_state");
  return response;
}
