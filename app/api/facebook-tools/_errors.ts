import { NextResponse } from "next/server";
import { FacebookGraphError } from "@/lib/facebookTools/facebookGraphClient";
import { FacebookToolsValidationError } from "@/lib/facebookTools/facebookTools.errors";

export function handleFacebookToolsError(error: unknown): NextResponse {
  if (error instanceof FacebookToolsValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof FacebookGraphError) {
    return NextResponse.json(
      { error: error.message, requiresReconnect: error.requiresReconnect },
      { status: error.requiresReconnect ? 409 : 502 }
    );
  }
  if (error instanceof Error && error.message.startsWith("FACEBOOK_")) {
    // Missing/invalid Meta App credentials or encryption key — a
    // configuration problem, not a caller error.
    console.error("Facebook Tools configuration error:", error);
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
  console.error("Unexpected error in Facebook Tools API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
