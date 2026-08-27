/** Facebook Live Comment Shield (MVP). No AI classification, no scheduled
 * auto-run, no reply, no personal-account login — see the module's own
 * completion report for full scope boundaries. */

export type FacebookPageStatus = "Connected" | "Reconnect Required" | "Disconnected";

export interface FacebookPage {
  id: string;
  facebook_page_id: string;
  page_name: string;
  /** AES-256-GCM ciphertext (lib/facebookTools/tokenCrypto.ts) — never the
   * plaintext Page Access Token. Only ever read server-side, never sent to
   * the browser (see facebookPage.service.ts's list/get projections). */
  access_token_encrypted: string;
  token_expires_at?: string | null;
  status: FacebookPageStatus;
  connected_by_staff_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** What the browser is actually allowed to see for a connected Page — never
 * the encrypted token column. */
export type FacebookPageSummary = Omit<FacebookPage, "access_token_encrypted">;

/** "Not Processed" until a hide job has run at least once for this post;
 * mirrors the most recent facebook_hide_jobs.status for that post
 * (denormalized onto the row for the Live Post Selection list — see
 * facebookLivePost.service.ts's syncLivePosts). */
export type FacebookLivePostProcessingStatus =
  | "Not Processed"
  | "In Progress"
  | "Completed"
  | "Completed With Errors"
  | "Failed";

/** Meta's own broadcast status for the live video (Graph API's `status`
 * field on the live_videos edge) — distinct from processing_status above
 * (this module's own hide-job progress). Free text, no exhaustive union
 * enforced anywhere: a direct pass-through of whatever Graph API returns,
 * not a value this application invents or constrains (same convention as
 * every other free-text status column in this codebase). Non-exhaustive
 * set actually seen/documented: "LIVE", "LIVE_STOPPED", "PROCESSING",
 * "VOD", plus Meta's documented UNPUBLISHED/SCHEDULED_* values. */
export type FacebookBroadcastStatus = string;

export interface FacebookLivePost {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
  title?: string | null;
  message?: string | null;
  live_at?: string | null;
  comment_count: number;
  /** Nullable — older rows synced before this column existed, and Graph
   * API doesn't guarantee the field is always populated. */
  broadcast_status?: FacebookBroadcastStatus | null;
  processing_status: FacebookLivePostProcessingStatus;
  last_synced_at: string;
  created_at?: string;
  updated_at?: string;
}

/** Phase 3 foundation (2026-08-24) — a read cache of comment content,
 * sitting between facebook_live_posts and facebook_hide_jobs so an Admin
 * can review what a livestream's comments actually say before starting a
 * hide job. Deliberately separate from FacebookHideCommentLog below
 * (that's a hide job's own audit trail, scoped to one hide_job_id; this
 * has no hide-job concept at all). */
export interface FacebookLivePostComment {
  id: string;
  facebook_live_post_id: string;
  facebook_comment_id: string;
  author_id?: string | null;
  author_name?: string | null;
  message?: string | null;
  comment_created_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type FacebookHideJobStatus = "pending" | "in_progress" | "completed" | "completed_with_errors" | "failed";

export interface FacebookHideJob {
  id: string;
  facebook_live_post_id: string;
  status: FacebookHideJobStatus;
  total_comments: number;
  processed_count: number;
  success_count: number;
  error_count: number;
  started_by_staff_id?: string | null;
  started_at: string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type FacebookHideCommentStatus = "pending" | "success" | "error";

export interface FacebookHideCommentLog {
  id: string;
  hide_job_id: string;
  facebook_comment_id: string;
  status: FacebookHideCommentStatus;
  attempt_count: number;
  error_message?: string | null;
  processed_at?: string | null;
  created_at?: string;
}

/** Returned by POST hide-jobs/[id]/process — one polling round's result, so
 * the UI can render progress without re-fetching the whole job. */
export interface FacebookHideJobProgress {
  job: FacebookHideJob;
  batchProcessed: number;
}

/** Content Discovery Foundation (Phase 2A). A read-only cache of a
 * connected Page's own regular feed posts (Graph API's `/{page-id}/posts`
 * edge) — not a source of truth, never written to by anything other than
 * syncPagePosts. Deliberately separate from FacebookLivePost: a livestream
 * can appear in both caches under different Facebook object ids; no
 * merge/dedup between the two in this phase (PO decision, 2026-08-25). */
export type FacebookPageContentDiscoveryStatus = "Active" | "Unavailable" | "Refresh Failed";

export interface FacebookPagePost {
  id: string;
  facebook_page_id: string;
  facebook_post_id: string;
  message?: string | null;
  permalink_url?: string | null;
  full_picture_url?: string | null;
  /** Meta's own classification (Graph API's `status_type` field, e.g.
   * "added_photos") — free text pass-through, not an application-invented
   * enum. Nullable: Graph doesn't guarantee the field is always present. */
  status_type?: string | null;
  comment_count: number;
  reaction_count: number;
  share_count: number;
  published_at?: string | null;
  discovery_status: FacebookPageContentDiscoveryStatus;
  last_synced_at: string;
  created_at?: string;
  updated_at?: string;
}

/** Content Repository UI (Phase 2B) — server-side pagination page size, a
 * CRM operational choice (grid-friendly: 3 columns × 8 rows on desktop),
 * not derived from any Meta limit. Mirrors
 * lib/salesLedger/... SALES_LEDGER_PAGE_SIZE's placement (types file, not
 * the service file). */
export const FACEBOOK_PAGE_POSTS_PAGE_SIZE = 24;

export interface FacebookPagePostFilters {
  pageId: string;
  page: number;
  search?: string;
  statusType?: string;
  discoveryStatus?: FacebookPageContentDiscoveryStatus;
  /** "YYYY-MM-DD", inclusive, Vietnam-local calendar day. */
  dateFrom?: string;
  /** "YYYY-MM-DD", inclusive, Vietnam-local calendar day — covers the full
   * day (see lib/facebookTools/facebookPagePost.service.ts's
   * vietnamDayEndExclusiveUtc), not just up to midnight UTC. */
  dateTo?: string;
}

export interface FacebookPagePostsPage {
  rows: FacebookPagePost[];
  totalCount: number;
}

/** Returned by POST page-posts — one bounded sync call's result. Every
 * field here must be reported accurately: a caller must never infer "fully
 * synced" from a truncated response, so `hasMore`/`nextCursor` and
 * `unavailabilityCheckPerformed` are explicit, not implied. See
 * lib/facebookTools/facebookPagePost.service.ts's syncPagePosts docstring
 * for exact semantics (PO decision, 2026-08-25). */
export interface FacebookPagePostSyncResult {
  requestCount: number;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  /** True only when this sync stopped at its page bound with more data
   * left on Facebook, not because it ran out of pages. */
  hasMore: boolean;
  nextCursor?: string;
  /** False whenever hasMore is true — a bounded (non-exhaustive) fetch
   * gives no evidence about posts outside its bound, so this sync
   * deliberately skips marking anything "Unavailable" in that case. */
  unavailabilityCheckPerformed: boolean;
  unavailableCount: number;
}

/** Phase 2J-D — Personal/Group Facebook content the CRM has no API access
 * to discover (Meta's Groups API was removed for third-party apps in
 * 2024; Personal-account post listing is not an approved use case for
 * this product — see the Phase 2J-A/2J-B research). Captured instead by a
 * manager pasting a permalink URL. Deliberately independent of
 * FacebookPage/FacebookPagePost (Architecture B, Phase 2J-C) — this is
 * never stored as a fake Page. */
export type FacebookManualContentSourceType = "Personal" | "Group";

export interface FacebookManualContentReference {
  id: string;
  source_type: FacebookManualContentSourceType;
  source_label?: string | null;
  facebook_object_id: string;
  permalink_url: string;
  /** NULL unless genuinely retrieved — never fabricated. In this phase
   * always null (no token can read Personal/Group content). */
  message?: string | null;
  full_picture_url?: string | null;
  discovery_method: string;
  imported_by_staff_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** Read-only row shape from the facebook_content_index view (Phase 2J-D) —
 * the unified Content Repository browsing source, combining Page-synced
 * posts and manual Personal/Group references. Never a write path: nothing
 * in the application ever INSERTs/UPDATEs/DELETEs against this view. */
export interface FacebookContentIndexRow {
  id: string;
  source_type: "Page" | FacebookManualContentSourceType;
  source_label: string | null;
  message: string | null;
  permalink_url: string | null;
  full_picture_url: string | null;
  discovery_status: string;
  published_at: string | null;
  discovered_at: string;
  discovery_method: string;
  /** Facebook's own Page id — populated only for a "Page" row, null for a
   * manual reference (which has no Page relationship). */
  owning_page_id: string | null;
}

export interface ImportManualContentUrlsInput {
  urls: string[];
  source_type: FacebookManualContentSourceType;
  source_label?: string;
}

/** Honest, non-fabricated per-URL outcome — same established convention as
 * BulkCommentTaskResult (types/seeding.ts, Phase 2I). `skipped` is a URL
 * that parsed fine but is a duplicate (within this batch or against an
 * existing reference) — distinct from `failed`, which is a genuine
 * validation/parse failure. */
export interface ImportManualContentUrlsResult {
  created: { url: string; referenceId: string }[];
  skipped: { url: string; reason: string }[];
  failed: { url: string; reason: string }[];
}
