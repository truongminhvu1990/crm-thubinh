/** Facebook Seeding — Campaign Management (Phase 2C, 2026-08-26). Campaign
 * is a multi-target container: 1 Campaign → many Target Posts (a real Page
 * post, cached in facebook_page_posts) → many Tasks (Like/Comment/Share).
 * Still human-executed only: AI drafts Comment text, a human staff member
 * performs the action on Facebook themselves and reports back Done/Failed/
 * Skipped/Cancelled. No comment/like/share-posting integration exists
 * anywhere — no bot posting, no browser automation, no personal-account
 * automation, no scraping, no actor pool. */

export type SeedingCampaignStatus = "Draft" | "Active" | "Completed";

/** Phase 2G (M2) — server-enforced lifecycle, the single source of truth
 * for both the API layer (seedingCampaign.service.ts's updateCampaign) and
 * the UI (campaign detail page imports this directly, same convention as
 * SEEDING_TASK_ALLOWED_TRANSITIONS below — no separate client-side copy
 * that could silently drift out of sync with the server). Completed ->
 * Active (reopen) is the one addition over the pre-2G lifecycle; Draft and
 * Active's own allowed transitions are unchanged. */
export const SEEDING_CAMPAIGN_ALLOWED_TRANSITIONS: Record<SeedingCampaignStatus, SeedingCampaignStatus[]> = {
  Draft: ["Active"],
  Active: ["Completed"],
  Completed: ["Active"],
};

/** Free text at the DB layer (no CHECK constraint) — this union documents
 * the starting set, same convention as PartnerType/PartnerStatus. */
export type SeedingCampaignObjective = "Tăng tương tác" | "Tạo thảo luận" | "Kéo inbox";

export interface SeedingCampaign {
  id: string;
  name: string;
  /** Nullable (Phase 2J-D) — null for a manual-only campaign (every target
   * is a Personal/Group manual reference, no connected Page involved at
   * all). Still required and always populated for a Page-backed campaign,
   * exactly as before this phase. */
  facebook_page_id: string | null;
  /** Nullable (Phase 2C) — no longer the source of truth for what a
   * campaign targets; a Campaign now targets 0..N posts via
   * seeding_campaign_targets. Kept only for backward compatibility with
   * any pre-Phase-2C campaign that set it directly. */
  facebook_post_id?: string | null;
  post_content_snapshot?: string | null;
  product_id?: string | null;
  objective: string;
  status: SeedingCampaignStatus;
  created_by_staff_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type CreateSeedingCampaignInput = Pick<SeedingCampaign, "name" | "objective"> &
  Partial<Pick<SeedingCampaign, "product_id" | "status" | "facebook_page_id">> & {
    /** facebook_page_posts.id values (cache rows, not raw Facebook post
     * ids) — the Content Repository / Post Picker's selection. Optional:
     * a Draft campaign may start with 0 targets and have them added later
     * via seeding_campaign_targets' own endpoint. */
    targetFacebookPagePostIds?: string[];
    /** Phase 2J-D — facebook_manual_content_references.id values (Personal/
     * Group content, manually imported). May be combined with
     * targetFacebookPagePostIds in the same campaign (a "mixed" campaign)
     * or used alone (a "manual-only" campaign, facebook_page_id omitted). */
    targetManualContentReferenceIds?: string[];
  };

export type UpdateSeedingCampaignInput = Partial<
  Pick<SeedingCampaign, "name" | "objective" | "status" | "post_content_snapshot">
>;

/** One post a Campaign targets. facebook_post_id here is a snapshot of the
 * underlying content's own stable Facebook object id (immutable natural
 * identity) — kept alongside the FK so a target row is still meaningful
 * even if the corresponding cache/reference row is ever deleted (ON DELETE
 * CASCADE means that can't actually leave an orphan, but the snapshot
 * avoids a join being the only way to know which Facebook content this
 * ever was).
 *
 * Phase 2J-D — exactly one of facebook_page_post_id / manual_content_
 * reference_id is ever set (DB-enforced by seeding_campaign_targets'
 * exclusive-arc CHECK constraint, seeding_campaign_targets_exactly_one_
 * source). A Page-backed target (the only kind that existed before this
 * phase) always has facebook_page_post_id set and manual_content_
 * reference_id null — unchanged from before. A manual-reference target
 * (Personal/Group content, Architecture B) is the reverse. facebook_post_id
 * itself is always populated regardless of which arm is used. */
export interface SeedingCampaignTarget {
  id: string;
  campaign_id: string;
  facebook_page_post_id: string | null;
  manual_content_reference_id: string | null;
  facebook_post_id: string;
  created_at?: string;
  updated_at?: string;
}

/** Enriched for display — the target row plus the live (not snapshotted)
 * current state of its underlying content, read via a join to whichever of
 * facebook_page_posts / facebook_manual_content_references actually backs
 * it. discovery_status/permalink_url/message are deliberately LIVE, not
 * snapshotted on the target itself, so the UI can warn "bài này hiện
 * Unavailable" even after the target was created.
 *
 * Phase 2J-D — source_type distinguishes "Page" (unchanged, existing
 * behavior) from "Personal"/"Group" (manual references) so the UI can
 * honestly label what kind of content this is; never fabricated for a
 * manual reference — message/full_picture_url stay null unless the
 * reference row itself genuinely has them. */
export interface SeedingCampaignTargetWithPost extends SeedingCampaignTarget {
  source_type: "Page" | "Personal" | "Group";
  source_label: string | null;
  message: string | null;
  permalink_url: string | null;
  full_picture_url: string | null;
  discovery_status: string;
}

export interface AddCampaignTargetsResult {
  added: SeedingCampaignTarget[];
  /** facebook_page_post_id values that were already a target of this
   * campaign — silently skipped, not an error (idempotent bulk-add, same
   * convention as this codebase's upsert-based sync flows). */
  alreadyTargeted: string[];
}

/** total = every task across every target; the rest partition it exactly
 * (no double counting, Failed is never folded into Done). */
export interface SeedingCampaignProgress {
  total: number;
  pending: number;
  inProgress: number;
  done: number;
  failed: number;
  skipped: number;
  cancelled: number;
}

/** The 4 required comment categories (module scope). */
export type SeedingCommentCategory = "hoi_thong_tin" | "tao_thao_luan" | "kien_thuc" | "phan_hoi_tu_nhien";

export const SEEDING_COMMENT_CATEGORY_LABELS: Record<SeedingCommentCategory, string> = {
  hoi_thong_tin: "Hỏi thông tin",
  tao_thao_luan: "Tạo thảo luận",
  kien_thuc: "Kiến thức",
  phan_hoi_tu_nhien: "Phản hồi tự nhiên",
};

/** Phase 2K-AW — request-time only, never persisted (seeding_comment_
 * suggestions carries no intent column). Purely steers the ANGLE of a
 * single Generate/Regenerate call; never a source of factual product
 * information — see buildSystemPrompt's per-intent anti-fabrication
 * reinforcement in lib/seeding/seedingComment.ai.service.ts. */
export type SeedingCommentIntent = "ALL" | "PRICE_INQUIRY" | "SIZE_INQUIRY" | "PRODUCT_INTEREST" | "SOCIAL_PROOF";

export interface SeedingCommentSuggestion {
  id: string;
  campaign_id: string;
  /** Phase 2K-AR — nullable, additive. Null for every suggestion generated
   * before this field existed, or generated with no target selected (the
   * campaign-level fallback) — never backfilled/guessed after the fact,
   * same convention as seeding_tasks' own legacy-nullable FKs. */
  campaign_target_id: string | null;
  category: SeedingCommentCategory;
  content: string;
  generation_batch: number;
  created_at?: string;
}

export type SeedingTaskActionType = "Like" | "Comment" | "Share";

export type SeedingTaskStatus = "Pending" | "In Progress" | "Done" | "Failed" | "Skipped" | "Cancelled";

/** Locked state machine (PO decision, 2026-08-26): Pending can move to
 * anything; In Progress can move to any terminal state but not back to
 * Pending; every other status is terminal — no transition out of it at
 * all. Enforced in lib/seeding/seedingTask.service.ts's updateTaskStatus,
 * not a DB CHECK (consistent with this table's existing app-layer-only
 * validation convention). */
export const SEEDING_TASK_ALLOWED_TRANSITIONS: Record<SeedingTaskStatus, SeedingTaskStatus[]> = {
  Pending: ["In Progress", "Done", "Failed", "Skipped", "Cancelled"],
  "In Progress": ["Done", "Failed", "Skipped", "Cancelled"],
  Done: [],
  Failed: [],
  Skipped: [],
  Cancelled: [],
};

export interface SeedingTask {
  id: string;
  campaign_id: string;
  /** Nullable — a legacy (pre-Phase-2C) task may not have one; every new
   * task always sets it, and it is the source of truth for which post a
   * task belongs to going forward. */
  campaign_target_id?: string | null;
  /** Nullable (Phase 2C) — kept for backward-compat/query convenience
   * (denormalized from campaign_target_id going forward), no longer
   * written directly by new task creation. */
  facebook_post_id?: string | null;
  action_type: SeedingTaskActionType;
  suggested_comment_id?: string | null;
  /** Required when action_type is "Comment", must be omitted/null
   * otherwise — enforced in seedingTask.service.ts, not a DB CHECK. */
  comment_text?: string | null;
  assigned_staff_id?: string | null;
  scheduled_at?: string | null;
  status: SeedingTaskStatus;
  executed_by_staff_id?: string | null;
  executed_at?: string | null;
  /** Reused for both a Skipped reason and a Failed reason — the same
   * free-text field, no separate failure_reason column (an existing field
   * already served this purpose). */
  result_note?: string | null;
  /** Phase 2K-E — nullable, additive. Both null for every pre-existing
   * task and for the ongoing engagement-task shape (Like/Comment on an
   * already-existing post); populated together only for a distribution-
   * generated task (always action_type "Share"). Frozen at creation, a
   * direct FK reference — never a live read of the account/destination's
   * own current display fields. */
  execution_account_id?: string | null;
  destination_id?: string | null;
  /** Phase 2K-BK — Facebook's own comment id, set only when this Comment
   * task was published directly from the CRM via the official Graph API
   * (Page-sourced targets only). Null for every task completed through
   * the existing manual/assisted workflow, and for every legacy task —
   * never backfilled/guessed, same convention as every other nullable
   * FK/id on this table. */
  external_comment_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSeedingTaskInput {
  /** Required for every new task (Phase 2C) — campaign_target_id is
   * SeedingTask's own optional field only because a legacy row can lack
   * it; a task being created right now always has a target. */
  campaign_target_id: string;
  action_type: SeedingTaskActionType;
  suggested_comment_id?: string;
  /** Required only when action_type is "Comment" — validated in
   * seedingTask.service.ts, not by this type alone. */
  comment_text?: string;
  assigned_staff_id?: string;
  scheduled_at?: string;
  /** Phase 2K-E — optional, trailing, additive (same convention as
   * targetManualContentReferenceIds in Phase 2J-D): every existing caller
   * that never sets these keeps its exact current behavior, including the
   * existing dedup key's behavior (destination_id null on both sides of a
   * comparison is unchanged from before this field existed). */
  execution_account_id?: string;
  destination_id?: string;
}

export interface UpdateSeedingTaskStatusInput {
  status: SeedingTaskStatus;
  result_note?: string | null;
}

/** My Tasks (Phase 2D) — a Task enriched with just enough campaign/target/
 * post context for a `seeding.execute` staff member to act on it without
 * the UI issuing any follow-up request (getTasksAssignedToStaff embeds all
 * of this in one query). Every context field is nullable: a legacy task
 * (no campaign_target_id) or a target whose post no longer resolves must
 * render gracefully, never crash. */
export interface SeedingTaskWithContext extends SeedingTask {
  campaign_name: string | null;
  /** Phase 2G (M1-C) — null only for a legacy task with no resolvable
   * campaign context (same nullability convention as campaign_name).
   * My Tasks uses this to indicate a closed campaign and withhold the
   * normal execution actions — informational/gating in the UI only, never
   * used to alter task data. */
  campaign_status: SeedingCampaignStatus | null;
  target_message: string | null;
  target_permalink_url: string | null;
  target_full_picture_url: string | null;
  /** Phase 2E — the target post's LIVE discovery_status (Active/
   * Unavailable/Refresh Failed), null for a legacy task with no target.
   * Warn-only: never blocks a task action. */
  target_discovery_status: string | null;
  /** Phase 2K-E — which of the two exclusive-arc content sources this
   * task's target actually resolved from. Mirrors
   * SeedingCampaignTargetWithPost.source_type exactly (getTargetsByCampaign's
   * already-proven pattern) — null only for a legacy task with no
   * resolvable target. Fixes a real Phase 2J-era gap: before this field
   * existed, getTasksAssignedToStaff only ever joined
   * facebook_page_posts, so a manual-content-backed task silently
   * rendered with no context at all. */
  target_source_type: "Page" | "Personal" | "Group" | null;
}

/** Phase 2I (I2) — bulk Comment task creation across many selected targets
 * with one shared comment. Reuses createTask's existing validation/
 * duplicate-protection per target (lib/seeding/seedingTask.service.ts) —
 * this is a thin per-target loop, not a new persistence path. */
export interface CreateBulkCommentTasksInput {
  targetIds: string[];
  comment_text: string;
  assigned_staff_id?: string;
  scheduled_at?: string;
}

/** Honest, non-fabricated per-target outcome — never collapsed into a
 * single success/fail flag. `skipped` is a target where an identical
 * non-terminal task already existed (Phase 2I I1's duplicate protection) —
 * distinct from `failed`, which is a genuine error. */
export interface BulkCommentTaskResult {
  created: { targetId: string; taskId: string }[];
  skipped: { targetId: string; reason: string }[];
  failed: { targetId: string; error: string }[];
}

/** Phase 2F — AI-Powered Evidence Reconciliation. This is CONTENT evidence
 * only: whether text matching a Comment task's assigned comment_text exists
 * on the target Page post. It is NEVER identity verification — no result
 * here may ever be read, displayed, or coded as "who performed the action."
 * Confirmed PROVEN NO-GO by the preceding capability spike: Meta does not
 * expose reliable third-party commenter identity to a Page token. */
export type SeedingTaskEvidenceResult =
  | "Exact Match"
  | "AI Match (High Confidence)"
  | "Ambiguous"
  | "Not Found"
  | "Partial Evidence"
  | "Evidence Unavailable"
  | "Reconnect Required";

/** Locked confidence mapping (PO decision, 2026-08-26) — the only results
 * NOT auto-resolved, i.e. the manager's default "needs attention" queue.
 * Exact Match / AI Match (High Confidence) / Not Found are real, final
 * answers and are deliberately excluded from this set. */
export const SEEDING_TASK_EVIDENCE_EXCEPTION_RESULTS: SeedingTaskEvidenceResult[] = [
  "Ambiguous",
  "Partial Evidence",
  "Evidence Unavailable",
  "Reconnect Required",
];

/** Transient-failure results: auto-eligible for the next reconciliation
 * batch round without any explicit recheck trigger, since they represent
 * "we couldn't get a real answer yet," not a real conclusion. Every other
 * result requires the task's comment_text to change (hash mismatch) before
 * it becomes eligible again — never re-fetched/re-AI'd just because a batch
 * ran (PO-locked idempotency rule, §7-8). */
export const SEEDING_TASK_EVIDENCE_TRANSIENT_RESULTS: SeedingTaskEvidenceResult[] = [
  "Partial Evidence",
  "Evidence Unavailable",
  "Reconnect Required",
];

export type SeedingTaskEvidenceConfidence = "high" | "medium" | "low";

export interface SeedingTaskEvidenceResultRow {
  id: string;
  task_id: string;
  result: SeedingTaskEvidenceResult;
  matched_comment_id?: string | null;
  matched_comment_snippet?: string | null;
  confidence?: SeedingTaskEvidenceConfidence | null;
  comment_text_hash: string;
  evidence_snapshot_hash?: string | null;
  model_version?: string | null;
  prompt_version?: string | null;
  checked_at: string;
  checked_by_staff_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** One row per reconciliation run ever performed for a task — the
 * append-only counterpart to SeedingTaskEvidenceResultRow's current-state
 * row. Same shape minus created_at/updated_at (never updated). */
export type SeedingTaskEvidenceCheckLog = Omit<SeedingTaskEvidenceResultRow, "created_at" | "updated_at">;

/** A Comment task enriched with its current evidence result (or nulls if
 * never checked) — what the campaign detail UI's evidence queue reads. */
export interface SeedingTaskWithEvidence extends SeedingTask {
  evidence_result: SeedingTaskEvidenceResult | null;
  evidence_confidence: SeedingTaskEvidenceConfidence | null;
  evidence_matched_comment_snippet: string | null;
  evidence_checked_at: string | null;
}

/** One reconciliation batch round's outcome — mirrors
 * FacebookHideJobProgress's shape (a job/log precedent this feature reuses
 * architecturally): the caller polls again while hasMoreCandidates is true,
 * exactly like Comment Shield's processNextBatch loop. */
export interface SeedingEvidenceReconciliationBatchResult {
  processed: number;
  hasMoreCandidates: boolean;
  results: { taskId: string; result: SeedingTaskEvidenceResult }[];
  /** Phase 2J-D — a manual-source task (Personal/Group content, no
   * connected Page/token) is structurally impossible to Graph-verify. No
   * existing SeedingTaskEvidenceResult value honestly represents that (see
   * the Phase 2J-D reconciliation report — "Evidence Unavailable" is
   * documented as a transient, auto-retry state, not a permanent
   * structural one; every other value implies an attempt occurred). Rather
   * than misuse an existing state or invent a new persisted one, these
   * tasks are simply never processed — evidence_result stays at its
   * existing, honest "never checked" null — and reported here instead, in
   * the batch's own response, not the DB. */
  skippedNoConnectedSource: { taskId: string; reason: string }[];
}

/** Phase 2K-E — a real Facebook identity staff manually operate. Never
 * stores credentials of any kind (see the module's own migration
 * comment). assigned_staff_id is a mutable DEFAULT-operator suggestion
 * only, never an exclusivity lock or a live source of truth for who
 * actually performed any given task — a generated task freezes its own
 * assigned_staff_id independently. */
export type SeedingExecutionAccountStatus = "Active" | "Inactive";

export interface SeedingExecutionAccount {
  id: string;
  display_name: string;
  status: SeedingExecutionAccountStatus;
  assigned_staff_id: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSeedingExecutionAccountInput {
  display_name: string;
  assigned_staff_id?: string | null;
  notes?: string | null;
}

export type UpdateSeedingExecutionAccountInput = Partial<
  Pick<SeedingExecutionAccount, "display_name" | "status" | "assigned_staff_id" | "notes">
>;

/** Phase 2K-E — a place (Facebook Group today) work can be distributed
 * into. Deliberately not content: no message/full_picture_url — a
 * destination is where to post, never what already exists there. Never
 * confused with facebook_manual_content_references (Phase 2J), which
 * represents a specific existing post already discovered inside a Group
 * for evidence/tracking purposes, not a reusable destination directory
 * entry. */
export type SeedingDestinationStatus = "Active" | "Inactive";

export interface SeedingDestination {
  id: string;
  label: string;
  platform: string;
  destination_type: string;
  permalink_url: string;
  /** The normalized, stable Group id — never a post id. Dedup identity
   * (unique index), not permalink_url — mirrors
   * facebook_manual_content_references.facebook_object_id. */
  external_group_id: string;
  status: SeedingDestinationStatus;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSeedingDestinationInput {
  label: string;
  /** The raw Facebook Group URL, exactly as pasted — parsed server-side by
   * parseFacebookGroupDestinationUrl (lib/facebookTools/facebookUrlParser.ts)
   * into external_group_id. Never accepted pre-parsed from the client. */
  permalink_url: string;
  notes?: string | null;
}

/** Phase 2K-AA — permalink_url is now editable (PO decision, 2026-08-28,
 * reversing the original immutable-identity lock): re-parsed server-side
 * through parseFacebookGroupDestinationUrl exactly like create, and
 * external_group_id's dedup check re-runs on update (excluding the record
 * being edited) — never accepted pre-parsed from the client. */
export type UpdateSeedingDestinationInput = Partial<Pick<SeedingDestination, "label" | "status" | "notes" | "permalink_url">>;

/** Phase 2K-E — the stateless compute -> preview -> confirm distribution
 * flow (Architecture C, locked 2K-B/C/D). Preview and confirm share this
 * exact same input shape deliberately: the client never sends a computed
 * assignment, only the selection it wants distributed — the server always
 * recomputes the actual assignment itself, on both calls. */
export interface SeedingDistributionInput {
  campaign_target_id: string;
  destination_ids: string[];
  execution_account_ids: string[];
  scheduled_at?: string;
}

export interface SeedingDistributionAssignmentRow {
  destination_id: string;
  destination_label: string;
  execution_account_id: string;
  execution_account_label: string;
  campaign_target_id: string;
  source_type: "Page" | "Personal" | "Group";
  content_message: string | null;
  content_permalink_url: string | null;
  /** Preview only — true when a non-terminal task for this exact
   * (campaign_target_id, destination_id) pair already exists. Confirm
   * never fabricates this field; it simply skips such rows via the same
   * existing duplicate-protection check createTaskInternal already
   * performs. */
  already_exists?: boolean;
}

/** Preview response — read-only, zero database writes. */
export interface SeedingDistributionPreviewResult {
  totalCandidates: number;
  assignableCandidates: number;
  proposedAssignments: SeedingDistributionAssignmentRow[];
  skipped: { destination_id: string; reason: string }[];
  unavailableAccounts: { execution_account_id: string; reason: string }[];
  unavailableDestinations: { destination_id: string; reason: string }[];
  duplicates: { destination_id: string; existing_task_id: string }[];
  warnings: string[];
  confirmAllowed: boolean;
}

/** Confirm response — the only two persisted outputs of a distribution
 * operation are the created seeding_tasks rows (their ids returned here)
 * and one logActivity entry (not represented in this type — it carries no
 * queryable return value). No transaction: partial success is reported
 * honestly, never silently rolled back or silently claimed complete. */
export interface SeedingDistributionConfirmResult {
  created: { destination_id: string; task_id: string }[];
  skipped: { destination_id: string; reason: string }[];
  failed: { destination_id: string; reason: string }[];
}

/** Phase 2K-BK — Direct Facebook Comment Publish. Campaign-level (not
 * per-task): capability depends only on whether the campaign's own
 * connected Page is healthy in this CRM (facebook_pages.status), which
 * every Page-sourced task in the campaign shares. A Personal/Group-
 * sourced task is NOT_SUPPORTED regardless of this result — determined
 * per-task from the target's own source_type, not by this type.
 * AVAILABLE means "the Page is connected in this CRM" — it does NOT
 * guarantee Meta has actually granted the `pages_manage_posts`
 * permission this feature needs (a separate App Review step, tracked in
 * docs/FACEBOOK_COMMENT_SHIELD_META_APP_SETUP.md); an attempt can still
 * fail with a real Graph API permission error, surfaced honestly as a
 * Failed task, never silently ignored. */
export type SeedingDirectCommentAvailability = "AVAILABLE" | "UNAVAILABLE" | "NOT_SUPPORTED";

export interface SeedingDirectCommentCapability {
  availability: SeedingDirectCommentAvailability;
  reason?: string;
}
