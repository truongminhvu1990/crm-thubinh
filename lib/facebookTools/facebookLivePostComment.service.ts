import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { FacebookLivePostComment } from "@/types/facebookTools";
import { listLivePostComments } from "./facebookGraphClient";
import { getPageByFacebookPageId, getDecryptedPageAccessToken, markPageReconnectRequired, isReconnectRequiredError } from "./facebookPage.service";
import { getLivePostById } from "./facebookLivePost.service";

/** Comment content cache — Phase 3 foundation (2026-08-24). Sits between
 * facebook_live_posts and facebook_hide_jobs (see the module's own
 * architecture plan): a display cache of Graph API comment content,
 * refreshed on demand, never a source of truth — same shape as
 * facebookLivePost.service.ts's own getLivePosts/syncLivePosts, kept in
 * its own file since PO decided this is a genuinely separate concern from
 * both Live Post caching and hide-job tracking, not an extension of
 * either. No hide action anywhere in this file. */

export async function getLivePostComments(
  facebookLivePostId: string,
  client: SupabaseClient = supabase
): Promise<FacebookLivePostComment[]> {
  const { data, error } = await client
    .from("facebook_live_post_comments")
    .select("*")
    .eq("facebook_live_post_id", facebookLivePostId)
    .order("comment_created_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Error fetching Facebook live post comments:", error);
    return [];
  }
  return data as FacebookLivePostComment[];
}

/** Refresh the cache from Graph API — call on demand, not on a schedule
 * (module scope: "Không tự động chạy theo lịch"). Resolves the owning
 * Page's access token the same way facebookHideJob.service.ts's own
 * getPageAccessTokenForLivePost does (kept as its own small resolution
 * here rather than importing that private helper, to avoid touching
 * hide-job code at all for this foundation phase). */
export async function syncLivePostComments(
  facebookLivePostId: string,
  client: SupabaseClient = supabase
): Promise<FacebookLivePostComment[]> {
  const livePost = await getLivePostById(facebookLivePostId, client);
  if (!livePost) throw new Error("Facebook live post not found");

  const page = await getPageByFacebookPageId(livePost.facebook_page_id, client);
  if (!page) throw new Error("Facebook page not found for this live post");

  const accessToken = await getDecryptedPageAccessToken(page.id, client);

  let comments;
  try {
    comments = await listLivePostComments(livePost.facebook_post_id, accessToken);
  } catch (error) {
    if (isReconnectRequiredError(error)) await markPageReconnectRequired(page.id, client);
    throw error;
  }

  for (const comment of comments) {
    const { error } = await client.from("facebook_live_post_comments").upsert(
      {
        facebook_live_post_id: facebookLivePostId,
        facebook_comment_id: comment.id,
        author_id: comment.from?.id ?? null,
        author_name: comment.from?.name ?? null,
        message: comment.message ?? null,
        comment_created_at: comment.created_time ?? null,
      },
      { onConflict: "facebook_comment_id", ignoreDuplicates: false }
    );
    if (error) console.error("Error syncing Facebook live post comment:", error);
  }

  return getLivePostComments(facebookLivePostId, client);
}
