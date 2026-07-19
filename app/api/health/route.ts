import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function GET() {
  const timestamp = new Date().toISOString();

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("master_data").select("id").limit(1);

    if (error) {
      logger.error("Health check: database query failed", { message: error.message });
      return NextResponse.json({ status: "error", timestamp }, { status: 503 });
    }

    return NextResponse.json({ status: "ok", timestamp });
  } catch (err) {
    logger.error("Health check: unexpected failure", {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ status: "error", timestamp }, { status: 503 });
  }
}
