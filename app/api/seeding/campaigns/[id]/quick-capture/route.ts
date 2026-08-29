import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { quickCaptureTargetFromUrl } from "@/lib/seeding/seedingCampaignTarget.service";
import { handleSeedingError } from "../../../_errors";

/** Phase 2K-BU — Personal Post Quick Capture. Paste a Facebook URL, get a
 * campaign target, in one call: parse -> detect Page/Personal/Group ->
 * create-or-reuse the underlying reference -> create-or-reuse the
 * campaign target. Same seeding.manage boundary as every other target-
 * management route (GET/POST /targets). `source_type_override` is
 * optional and only ever accepted for "Personal" | "Group" — the client
 * can never assert "Page" (that's only ever server-detected from a real
 * facebook_page_posts match, never client-claimed). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const url = typeof body.url === "string" ? body.url : "";
    const sourceTypeOverride =
      body.source_type_override === "Personal" || body.source_type_override === "Group" ? body.source_type_override : undefined;

    const client = await createClient();
    const result = await quickCaptureTargetFromUrl(id, url, auth.staff.id, client, sourceTypeOverride);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
