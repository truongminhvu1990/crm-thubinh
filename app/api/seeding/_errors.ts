import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SeedingValidationError } from "@/lib/seeding/seeding.errors";
import { FacebookGraphError } from "@/lib/facebookTools/facebookGraphClient";

/** Phase 2F note: reconcileNextBatch() catches FacebookGraphError itself
 * and persists it as a per-task "Reconnect Required"/"Evidence Unavailable"
 * evidence result — it never throws one up to a route handler in normal
 * operation. This branch is a defensive fallback only (e.g. a Facebook
 * error surfacing from a path that isn't per-task, such as decrypting the
 * Page token itself). */
export function handleSeedingError(error: unknown): NextResponse {
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API error in Semi Seeding Assistant:", error);
    return NextResponse.json({ error: "Không thể tạo gợi ý comment (lỗi từ AI)" }, { status: 502 });
  }
  if (error instanceof FacebookGraphError) {
    if (error.requiresReconnect) {
      return NextResponse.json({ error: "Facebook Page cần kết nối lại trước khi đối soát bằng chứng." }, { status: 409 });
    }
    console.error("Facebook Graph API error in Semi Seeding Assistant:", error);
    return NextResponse.json({ error: "Không thể đọc dữ liệu từ Facebook để đối soát bằng chứng." }, { status: 502 });
  }
  if (error instanceof SeedingValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Unexpected error in Semi Seeding Assistant API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
