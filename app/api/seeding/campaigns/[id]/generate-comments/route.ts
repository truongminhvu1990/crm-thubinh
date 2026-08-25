import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permission/serverAuth";
import { createClient } from "@/lib/supabase/server";
import { getSuggestionsForCampaign, generateCommentSuggestions } from "@/lib/seeding/seedingComment.ai.service";
import { handleSeedingError } from "../../../_errors";

/** GET returns every suggestion generated so far (all batches); POST
 * generates one more batch — the same endpoint serves both "Generate" (no
 * prior suggestions) and "Regenerate" (prior suggestions exist and are fed
 * back to Claude as "avoid" context, see seedingComment.ai.service.ts). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const client = await createClient();
    const suggestions = await getSuggestionsForCampaign(id, client);
    return NextResponse.json(suggestions);
  } catch (error) {
    return handleSeedingError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission(request, "seeding.manage");
  if ("error" in auth) return auth.error;

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const productDescription = (body.productDescription as string | undefined) ?? null;
    const client = await createClient();
    const suggestions = await generateCommentSuggestions(id, productDescription, client);
    return NextResponse.json(suggestions, { status: 201 });
  } catch (error) {
    return handleSeedingError(error);
  }
}
