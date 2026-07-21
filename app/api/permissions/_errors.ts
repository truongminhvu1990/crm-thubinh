import { NextResponse } from "next/server";
import { PermissionServiceError } from "@/lib/permission/permissionCenter.service";

export function handlePermissionServiceError(error: unknown): NextResponse {
  if (error instanceof PermissionServiceError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Unexpected error in Permission Center API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
