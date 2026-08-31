import { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { BusinessTime } from "@/lib/businessTime";
import {
  FacebookPagePost,
  FacebookPagePostSyncResult,
  FacebookPagePostFilters,
  FacebookPagePostsPage,
  FACEBOOK_PAGE_POSTS_PAGE_SIZE,
} from "@/types/facebookTools";
import { listPagePosts, FacebookPagePostData, DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES } from "./facebookGraphClient";
import { getDecryptedPageAccessToken, markPageReconnectRequired, isReconnectRequiredError } from "./facebookPage.service";

/** Content Discovery Foundation (Phase 2A) — read-only cache of a connected
 * Page's own regular feed posts. Sibling to facebookLivePost.service.ts,
 * kept in its own file rather than merged into it (PO decision,
 * 2026-08-25): facebook_page_posts is a separate table, not deduplicated
 * against facebook_live_posts in this phase, and Comment Shield's working
 * code must stay untouched. No write call to Facebook exists anywhere in
 * this file — discovery/cache only. */

export async function getPagePosts(pageId: string, client: SupabaseClient = supabase): Promise<FacebookPagePost[]> {
  const { data, error } = await client
    .from("facebook_page_posts")
    .select("*")
    .eq("facebook_page_id", pageId)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("Error fetching Facebook page posts:", error);
    return [];
  }
  return data as FacebookPagePost[];
}

export async function getPagePostById(id: string, client: SupabaseClient = supabase): Promise<FacebookPagePost | null> {
  const { data, error } = await client.from("facebook_page_posts").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("Error fetching Facebook page post:", error);
    return null;
  }
  return data as FacebookPagePost | null;
}

/** Every cached row's single `column` value for a Page, paginated past
 * PostgREST's default row cap (1000) — a plain `.select()` with no range
 * silently truncates at that cap. Caught on Dev, 2026-08-25: a bounded
 * sync's createdCount over-counted because the un-paginated version of this
 * query silently returned only the first 1000 of 2082 existing rows. Kept
 * generic (table-agnostic within this file's own table, column-agnostic)
 * so getAllExistingPostIds and getDistinctStatusTypes below share this one
 * correctness-critical loop instead of each re-implementing it. */
async function fetchAllColumnValues(
  pageId: string,
  column: string,
  client: SupabaseClient
): Promise<unknown[]> {
  const values: unknown[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("facebook_page_posts")
      .select(column)
      .eq("facebook_page_id", pageId)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    rows.forEach((r) => values.push(r[column]));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return values;
}

async function getAllExistingPostIds(pageId: string, client: SupabaseClient): Promise<Set<string>> {
  const values = await fetchAllColumnValues(pageId, "facebook_post_id", client);
  return new Set(values as string[]);
}

/** Distinct `status_type` values actually present in a Page's cache — never
 * a hardcoded list (PO decision, 2026-08-26): a future sync can surface a
 * status_type Meta has never returned before, and the content-type filter
 * must offer exactly what the data has, not a frozen set from whenever this
 * was written. Sorted for stable UI ordering; nulls excluded (nothing to
 * filter by). */
export async function getDistinctStatusTypes(pageId: string, client: SupabaseClient = supabase): Promise<string[]> {
  const values = await fetchAllColumnValues(pageId, "status_type", client);
  const distinct = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) distinct.add(v);
  }
  return [...distinct].sort();
}

/** The exact UTC instant of Vietnam-local 00:00:00 on `dateStr`
 * ("YYYY-MM-DD", e.g. from a date `<input>`). Appending "T00:00:00Z" makes
 * the parse timezone-independent of the runtime's own local timezone
 * (never relies on server local time) — since Vietnam is UTC+7 (never
 * negative), that UTC instant always falls within the same calendar date,
 * so BusinessTime.startOfDay reads back the correct y/m/d every time. */
function vietnamDayStartUtc(dateStr: string): Date {
  return BusinessTime.startOfDay(new Date(`${dateStr}T00:00:00Z`));
}

/** The exclusive upper bound for "dateStr, in full" — the start of the
 * *next* Vietnam-local day, for a `.lt()` query. Built exactly per
 * docs/BUSINESS_TIME_FOUNDATION.md's documented recipe ("use endOfDay()+1ms,
 * not endOfDay() itself, for an exclusive range bound") — never
 * `endOfDay()` alone, which is inclusive 23:59:59.999 and would silently
 * exclude a post published in the last millisecond of the selected day
 * under a `.lt()` comparison. This is the fix for exactly the failure mode
 * PO flagged: "không được vô tình loại các post đăng vào cuối ngày." */
function vietnamDayEndExclusiveUtc(dateStr: string): Date {
  return new Date(BusinessTime.endOfDay(new Date(`${dateStr}T00:00:00Z`)).getTime() + 1);
}

export { vietnamDayStartUtc, vietnamDayEndExclusiveUtc };

/** Server-side paginated + filtered list for the Content Repository UI
 * (Phase 2B) — the browser must never receive all of a Page's cached posts
 * (2082+ on Dev). Same `.select(..., { count: "exact" }).range(from, to)`
 * shape as lib/salesLedger/salesLedger.repository.ts's getSalesLedgerPage,
 * this codebase's established server-side pagination convention. Sort is
 * fixed at published_at DESC (PO decision — no advanced sort needed).
 * Selects only list-relevant columns, never the whole row set beyond what
 * the grid/detail actually render. */
/** Shared WHERE-clause builder for both getPagePostsPage (full rows, one
 * page) and getPagePostIds (ids only, unpaginated) below — Phase 2K-CF
 * (Issue 5) extraction, same filters applied identically both ways so
 * "select all matching the current filter" can never silently diverge
 * from what the picker's own paginated list actually shows. */
function applyPagePostFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: Pick<FacebookPagePostFilters, "search" | "statusType" | "discoveryStatus" | "dateFrom" | "dateTo">
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  let q = query;
  if (filters.search) {
    const term = filters.search.replace(/[%,]/g, "");
    q = q.ilike("message", `%${term}%`);
  }
  if (filters.statusType) q = q.eq("status_type", filters.statusType);
  if (filters.discoveryStatus) q = q.eq("discovery_status", filters.discoveryStatus);
  if (filters.dateFrom) q = q.gte("published_at", vietnamDayStartUtc(filters.dateFrom).toISOString());
  if (filters.dateTo) q = q.lt("published_at", vietnamDayEndExclusiveUtc(filters.dateTo).toISOString());
  return q;
}

export async function getPagePostsPage(
  filters: FacebookPagePostFilters,
  client: SupabaseClient = supabase
): Promise<FacebookPagePostsPage> {
  const baseQuery = client
    .from("facebook_page_posts")
    .select(
      "id, facebook_page_id, facebook_post_id, message, permalink_url, full_picture_url, status_type, comment_count, reaction_count, share_count, published_at, discovery_status, last_synced_at",
      { count: "exact" }
    )
    .eq("facebook_page_id", filters.pageId);
  const query = applyPagePostFilters(baseQuery, filters);

  const pageNum = Math.max(1, filters.page || 1);
  const from = (pageNum - 1) * FACEBOOK_PAGE_POSTS_PAGE_SIZE;
  const to = from + FACEBOOK_PAGE_POSTS_PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (error) {
    console.error("Error fetching Facebook page posts page:", error);
    return { rows: [], totalCount: 0 };
  }
  return { rows: (data ?? []) as FacebookPagePost[], totalCount: count ?? 0 };
}

/** Ids-only, matching the exact same filter set as getPagePostsPage above
 * — for "Chọn tất cả" (create-campaign Post Picker, Decision B: select
 * every post matching the current search/filter, not just the currently-
 * loaded page). Deliberately never selects full post payloads — id only.
 *
 * Loops in PostgREST's own default page-size chunks (1000 rows/request)
 * until a page returns fewer than that — the exact same technique this
 * file's own fetchAllColumnValues above already uses for
 * getAllExistingPostIds/getDistinctStatusTypes, because a single
 * `.range(0, N)` request is silently capped at PostgREST's project-level
 * max-rows setting (1000) regardless of what N is requested — confirmed
 * live against Dev (2120 posts on the one connected Page; a naive single
 * `.range()` call returned only 1000, not the true matching count). Not
 * duplicating fetchAllColumnValues itself since that helper has no filter
 * parameter beyond pageId. */
export async function getPagePostIds(
  filters: Pick<FacebookPagePostFilters, "pageId" | "search" | "statusType" | "discoveryStatus" | "dateFrom" | "dateTo">,
  client: SupabaseClient = supabase
): Promise<string[]> {
  const ids: string[] = [];
  const pageSize = 1000;
  let offset = 0;
  for (;;) {
    const baseQuery = client.from("facebook_page_posts").select("id").eq("facebook_page_id", filters.pageId);
    const query = applyPagePostFilters(baseQuery, filters);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) {
      console.error("Error fetching Facebook page post ids:", error);
      return ids;
    }
    const rows = (data ?? []) as { id: string }[];
    rows.forEach((r) => ids.push(r.id));
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

function mapPost(pageId: string, post: FacebookPagePostData): Record<string, unknown> {
  return {
    facebook_page_id: pageId,
    facebook_post_id: post.id,
    message: post.message ?? null,
    permalink_url: post.permalink_url ?? null,
    full_picture_url: post.full_picture ?? null,
    status_type: post.status_type ?? null,
    comment_count: post.comments?.summary?.total_count ?? 0,
    reaction_count: post.reactions?.summary?.total_count ?? 0,
    share_count: post.shares?.count ?? 0,
    published_at: post.created_time ?? null,
    discovery_status: "Active",
    last_synced_at: new Date().toISOString(),
  };
}

/** Refresh the cache from Graph API — call on demand ("Làm mới"), never on
 * a schedule (module convention: "Không tự động chạy theo lịch", no
 * cron/worker exists in this codebase).
 *
 * Bounded by `maxPages` (PO decision, 2026-08-25, after an unbounded UAT
 * run walked past 2000 posts across two calls before being stopped) — a
 * CRM operational policy, not a Meta-guaranteed safe number. Every call
 * reports exactly how much of Facebook's actual data it covered
 * (requestCount/fetchedCount/hasMore/nextCursor) — a caller must never
 * treat a bounded result as "fully synced."
 *
 * discovery_status semantics:
 * - "Active": returned by this sync's Graph API call, content current.
 * - "Refresh Failed": the whole sync call failed with something other than
 *   a reconnect-required error (transient/unknown) — every previously
 *   cached row for this Page flips to this status, content untouched
 *   ("giữ cache cũ").
 * - "Unavailable": inferred ONLY when this call's fetch was exhaustive
 *   (hasMore === false) — a previously cached post id absent from a fully
 *   walked fresh result is real evidence it's gone. A bounded
 *   (hasMore === true) fetch gives no evidence about posts outside its
 *   bound, so this status transition is skipped entirely in that case
 *   (unavailabilityCheckPerformed: false in the returned result) — never
 *   inferred from a partial result. */
export async function syncPagePosts(
  pageId: string,
  facebookPageRowId: string,
  client: SupabaseClient = supabase,
  maxPages: number = DEFAULT_PAGE_POSTS_SYNC_MAX_PAGES
): Promise<FacebookPagePostSyncResult> {
  const accessToken = await getDecryptedPageAccessToken(facebookPageRowId, client);
  const existingIds = await getAllExistingPostIds(pageId, client);

  let fetchResult;
  try {
    fetchResult = await listPagePosts(pageId, accessToken, maxPages);
  } catch (error) {
    if (isReconnectRequiredError(error)) {
      await markPageReconnectRequired(facebookPageRowId, client);
    } else {
      const { error: updateError } = await client
        .from("facebook_page_posts")
        .update({ discovery_status: "Refresh Failed" })
        .eq("facebook_page_id", pageId);
      if (updateError) console.error("Error marking Facebook page posts as refresh failed:", updateError);
    }
    throw error;
  }

  let createdCount = 0;
  let updatedCount = 0;
  for (const post of fetchResult.posts) {
    if (existingIds.has(post.id)) updatedCount++;
    else createdCount++;

    const { error } = await client
      .from("facebook_page_posts")
      .upsert(mapPost(pageId, post), { onConflict: "facebook_post_id", ignoreDuplicates: false });
    if (error) console.error("Error syncing Facebook page post:", error);
  }

  let unavailableCount = 0;
  const unavailabilityCheckPerformed = !fetchResult.hasMore;
  if (unavailabilityCheckPerformed) {
    const freshIds = new Set(fetchResult.posts.map((p) => p.id));
    const missingIds = [...existingIds].filter((id) => !freshIds.has(id));
    if (missingIds.length > 0) {
      const { error } = await client
        .from("facebook_page_posts")
        .update({ discovery_status: "Unavailable", last_synced_at: new Date().toISOString() })
        .eq("facebook_page_id", pageId)
        .in("facebook_post_id", missingIds);
      if (error) console.error("Error marking Facebook page posts unavailable:", error);
      else unavailableCount = missingIds.length;
    }
  }

  return {
    requestCount: fetchResult.requestCount,
    fetchedCount: fetchResult.posts.length,
    createdCount,
    updatedCount,
    hasMore: fetchResult.hasMore,
    nextCursor: fetchResult.nextCursor,
    unavailabilityCheckPerformed,
    unavailableCount,
  };
}
