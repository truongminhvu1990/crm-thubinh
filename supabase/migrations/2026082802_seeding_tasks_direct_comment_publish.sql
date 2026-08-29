-- Phase 2K-BK — Direct Facebook Comment Publish (Page-only).
--
-- Adds the ONE column genuinely needed to support publishing a Comment
-- task's text directly to Facebook via the official Graph API, for
-- Page-sourced targets only (see docs/2K-BK feasibility audit — Personal
-- and Group have no supported API path and are not touched by this
-- migration).
--
-- No new status enum: the existing SEEDING_TASK_ALLOWED_TRANSITIONS state
-- machine (Pending -> In Progress -> Done/Failed, locked PO decision
-- 2026-08-26) already has exactly the right semantics for a publish
-- lifecycle (In Progress = "posting", Done = "posted", Failed = "failed
-- with reason in the existing result_note field") — reused as-is, not
-- redesigned.
--
-- Nullable, additive, no backfill: every existing row (all created before
-- this feature existed) simply has external_comment_id = NULL forever,
-- exactly like every other legacy-nullable column on this table
-- (execution_account_id, destination_id, campaign_target_id).

BEGIN;

ALTER TABLE seeding_tasks
  ADD COLUMN IF NOT EXISTS external_comment_id text;

COMMENT ON COLUMN seeding_tasks.external_comment_id IS
  'Facebook''s own comment id, returned by POST /{post-id}/comments when a Comment task was published directly from the CRM (Phase 2K-BK). NULL for every task completed via the existing manual/assisted workflow, and for every task predating this feature.';

COMMIT;

-- Verification (run manually against Dev before/after applying, per the
-- project's existing schema-check convention — not executed by this
-- migration itself):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'seeding_tasks' AND column_name = 'external_comment_id';
