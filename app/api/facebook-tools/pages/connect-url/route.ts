import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { buildOAuthConnectUrl } from "@/lib/facebookTools/facebookPage.service";
import { handleFacebookToolsError } from "../../_errors";

/** Step 0 of Facebook Login for Business: mint the OAuth URL the browser
 * navigates to, and stash a CSRF state value in an httpOnly cookie that the
 * callback route below verifies before touching the database. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission(request, "facebook_tools.manage");
  if ("error" in auth) return auth.error;

  try {
    const state = crypto.randomUUID();
    const redirectUri = `${request.nextUrl.origin}/api/facebook-tools/pages/oauth/callback`;
    const url = buildOAuthConnectUrl(redirectUri, state);

    const response = NextResponse.json({ url });
    response.cookies.set("fb_oauth_state", state, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/api/facebook-tools/pages/oauth/callback",
    });
    return response;
  } catch (error) {
    return handleFacebookToolsError(error);
  }
}
