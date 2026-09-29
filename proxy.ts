import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/proxy";
import { logger } from "@/lib/logger";

// /api/integrations/catalogue-sync/products: machine-to-machine (Mini Catalogue's sync job), authenticated by its
// own independent Bearer-token check in the route itself (see that file) - not a human Supabase Auth session, so
// it is exempt from this cookie-based gate the same way /login already is.
const PUBLIC_PATHS = ["/login", "/api/integrations/catalogue-sync/products"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabase, getResponse } = createClient(request);

  // getUser() re-validates against the Supabase Auth server, unlike
  // getSession() which only trusts the cookie — required for a real gate.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublicPath = PUBLIC_PATHS.includes(pathname);

  if (!user && !isPublicPath) {
    logger.warn("Blocked unauthenticated request", { pathname });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return getResponse();
}

export const config = {
  matcher: [
    /*
     * Match every path except:
     * - /api/health (must be reachable unauthenticated)
     * - _next/static, _next/image (Next internals)
     * - favicon.ico and other static assets
     */
    "/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
