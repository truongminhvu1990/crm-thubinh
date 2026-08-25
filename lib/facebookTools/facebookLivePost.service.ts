import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { FacebookLivePost } from "@/types/facebookTools";
import { listLiveVideos } from "./facebookGraphClient";
import { getDecryptedPageAccessToken, markPageReconnectRequired, isReconnectRequiredError } from "./facebookPage.service";

/** Post fetching — the shared piece of the Facebook integration layer (see
 * facebookGraphClient.ts's own note). Cached list for the Live Post
 * Selection screen — read-only from the DB's point of view except
 * syncLivePosts() below, which is the only writer. facebook_live_posts is a
 * display cache of Facebook's /live_videos edge, never a source of truth.
 *
 * Deliberately scoped to Live Videos only, matching Comment Shield's own
 * scope — not because "post fetching" can only ever mean livestreams. A
 * future module needing regular feed posts adds a listFeedPosts() to
 * facebookGraphClient.ts and its own sync function here (or a sibling
 * file), following the same shape, rather than this file growing a second
 * responsibility. */
export async function getLivePosts(pageId: string, client: SupabaseClient = supabase): Promise<FacebookLivePost[]> {
  const { data, error } = await client
    .from("facebook_live_posts")
    .select("*")
    .eq("facebook_page_id", pageId)
    .order("live_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Error fetching Facebook live posts:", error);
    return [];
  }
  return data as FacebookLivePost[];
}

/** Refresh the cache from Graph API — call on demand (Live Post Selection's
 * "Làm mới" button), not on a schedule (module scope: "Không tự động chạy
 * theo lịch"). */
export async function syncLivePosts(
  pageId: string,
  facebookPageRowId: string,
  client: SupabaseClient = supabase
): Promise<FacebookLivePost[]> {
  const accessToken = await getDecryptedPageAccessToken(facebookPageRowId, client);

  let liveVideos;
  try {
    liveVideos = await listLiveVideos(pageId, accessToken);
  } catch (error) {
    if (isReconnectRequiredError(error)) await markPageReconnectRequired(facebookPageRowId, client);
    throw error;
  }

  for (const video of liveVideos) {
    // Deliberately no `processing_status` field here — this upsert's SET
    // clause only touches the columns listed below, so an existing row's
    // hide-job processing_status is left exactly as it was on every
    // re-sync (Supabase's upsert only updates columns present in the
    // payload, never the whole row).
    const { error } = await client.from("facebook_live_posts").upsert(
      {
        facebook_page_id: pageId,
        facebook_post_id: video.id,
        title: video.title ?? null,
        message: video.description ?? null,
        live_at: video.creation_time ?? null,
        comment_count: video.comments?.summary?.total_count ?? 0,
        broadcast_status: video.status ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "facebook_post_id", ignoreDuplicates: false }
    );
    if (error) console.error("Error syncing Facebook live post:", error);
  }

  return getLivePosts(pageId, client);
}

export async function getLivePostById(id: string, client: SupabaseClient = supabase): Promise<FacebookLivePost | null> {
  const { data, error } = await client.from("facebook_live_posts").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook live post:", error);
    return null;
  }
  return data as FacebookLivePost | null;
}

export async function updateLivePostProcessingStatus(
  id: string,
  status: FacebookLivePost["processing_status"],
  client: SupabaseClient = supabase
): Promise<void> {
  const { error } = await client.from("facebook_live_posts").update({ processing_status: status }).eq("id", id);
  if (error) console.error("Error updating Facebook live post processing status:", error);
}
