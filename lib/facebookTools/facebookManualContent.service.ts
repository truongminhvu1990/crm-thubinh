import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  FacebookManualContentReference,
  FacebookContentIndexRow,
  ImportManualContentUrlsInput,
  ImportManualContentUrlsResult,
} from "@/types/facebookTools";
import { parseFacebookContentUrl } from "./facebookUrlParser";
import { FacebookToolsValidationError } from "./facebookTools.errors";

/** Phase 2J-D — Unified Content Repository, Architecture B (approved
 * Phase 2J-C): Personal/Group Facebook content the CRM has no API access
 * to discover, captured by a manager pasting permalink URLs. Deliberately
 * independent of facebookPage.service.ts/facebookPagePost.service.ts —
 * this file never touches facebook_pages or facebook_page_posts, and
 * nothing here ever calls Facebook's Graph API (no token exists that could
 * read this content anyway). Sibling to facebookPagePost.service.ts, same
 * one-concern-per-file convention. */

export async function getManualContentReferenceById(
  id: string,
  client: SupabaseClient = supabase
): Promise<FacebookManualContentReference | null> {
  const { data, error } = await client.from("facebook_manual_content_references").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook manual content reference:", error);
    return null;
  }
  return data as FacebookManualContentReference | null;
}

/** Content Repository's "manual content" section — every manually-imported
 * reference, newest first. Reads through the unified facebook_content_index
 * view (filtered to non-Page rows) rather than the base table directly, so
 * the same read shape the view exposes for future unified browsing is
 * exercised now, not left dead. Never a write path. */
export async function getManualContentIndex(client: SupabaseClient = supabase): Promise<FacebookContentIndexRow[]> {
  const { data, error } = await client
    .from("facebook_content_index")
    .select("*")
    .neq("source_type", "Page")
    .order("discovered_at", { ascending: false });
  if (error) {
    console.error("Error fetching Facebook manual content index:", error);
    return [];
  }
  return data as FacebookContentIndexRow[];
}

/** Batch URL import — the Level 3 fallback (Phase 2J-A) for content no
 * official API can list. Honest, non-fabricated per-URL reporting
 * (created/skipped/failed), same established convention as
 * createBulkCommentTasks (lib/seeding/seedingTask.service.ts, Phase 2I).
 * Never claims a successful import for a URL that wasn't actually
 * confidently parsed and stored — an unsupported/malformed URL is
 * `failed`, never silently coerced into something it isn't. `message`/
 * `full_picture_url` are never fabricated — no token exists to fetch real
 * content for Personal/Group posts, so every created reference has both
 * fields null, honestly. */
export async function importManualContentUrls(
  input: ImportManualContentUrlsInput,
  actorStaffId: string | null,
  client: SupabaseClient = supabase
): Promise<ImportManualContentUrlsResult> {
  const result: ImportManualContentUrlsResult = { created: [], skipped: [], failed: [] };

  const urls = (input.urls ?? []).map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) {
    throw new FacebookToolsValidationError("Vui lòng nhập ít nhất một URL");
  }
  if (input.source_type !== "Personal" && input.source_type !== "Group") {
    throw new FacebookToolsValidationError(`source_type không hợp lệ: ${input.source_type}`);
  }

  const { data: existingRows, error: existingError } = await client
    .from("facebook_manual_content_references")
    .select("facebook_object_id");
  if (existingError) throw existingError;
  const existingObjectIds = new Set(((existingRows ?? []) as { facebook_object_id: string }[]).map((r) => r.facebook_object_id));

  const seenInBatch = new Set<string>();

  for (const url of urls) {
    const parsed = parseFacebookContentUrl(url);
    if (!parsed.ok) {
      result.failed.push({ url, reason: parsed.reason });
      continue;
    }

    // Phase 2J-D1 — a real Group permalink must be imported under
    // source_type "Group", never silently accepted under "Personal". The
    // reverse is intentionally allowed (a Page/Profile/reel URL imported
    // under "Group" still succeeds, unchanged from before this fix) — the
    // manager's own source_type choice for a non-Group-shaped URL is
    // metadata this parser has no way to contradict.
    if (parsed.isGroupUrl && input.source_type !== "Group") {
      result.failed.push({ url, reason: "Đây là link bài viết trong Nhóm — vui lòng chọn nguồn \"Nhóm\" để nhập link này" });
      continue;
    }

    if (seenInBatch.has(parsed.facebookObjectId)) {
      result.skipped.push({ url, reason: "Trùng với một URL khác trong cùng lượt nhập" });
      continue;
    }
    if (existingObjectIds.has(parsed.facebookObjectId)) {
      result.skipped.push({ url, reason: "Nội dung này đã được nhập trước đó" });
      continue;
    }
    seenInBatch.add(parsed.facebookObjectId);

    try {
      const { data, error } = await client
        .from("facebook_manual_content_references")
        .insert({
          source_type: input.source_type,
          source_label: input.source_label?.trim() || null,
          facebook_object_id: parsed.facebookObjectId,
          permalink_url: url,
          message: null,
          full_picture_url: null,
          discovery_method: "Manual Import",
          imported_by_staff_id: actorStaffId,
        })
        .select()
        .single();
      if (error) throw error;
      result.created.push({ url, referenceId: data.id });
    } catch (error) {
      // Never leak a raw DB/driver error to the client — same discipline
      // established in Phase 2I (createBulkCommentTasks's per-target
      // catch). Logged server-side, generic message returned.
      console.error("Failed to import manual content reference for URL", url, error);
      result.failed.push({ url, reason: "Không thể lưu URL này" });
    }
  }

  return result;
}
