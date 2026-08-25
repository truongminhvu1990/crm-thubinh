import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SeedingValidationError } from "@/lib/seeding/seeding.errors";

export function handleSeedingError(error: unknown): NextResponse {
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API error in Semi Seeding Assistant:", error);
    return NextResponse.json({ error: "Không thể tạo gợi ý comment (lỗi từ AI)" }, { status: 502 });
  }
  if (error instanceof SeedingValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Unexpected error in Semi Seeding Assistant API:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
