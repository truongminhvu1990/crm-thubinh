import { NextResponse } from "next/server";

export function handleOpsError(error: unknown): NextResponse {
  console.error("Unexpected error in Ops Console API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
