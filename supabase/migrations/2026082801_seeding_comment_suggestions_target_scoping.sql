-- Phase 2K-AR — target-scoped AI suggestion persistence.
--
-- seeding_comment_suggestions has always been campaign-level only (see
-- 2026082402_facebook_semi_seeding_module.sql), predating Phase 2C's
-- multi-target campaign model. Phase 2K-AI/2K-AN added per-target AI
-- generation CONTEXT, but never tagged the persisted rows themselves —
-- so after generating for multiple targets and reloading, every
-- suggestion ever generated for the campaign displays together with no
-- way to tell which target it was for. This adds that missing tag.
--
-- Nullable, same convention as seeding_tasks.campaign_target_id (added in
-- 2026082601_seeding_campaign_targets_module.sql): every historical
-- suggestion row keeps working unmodified and stays readable — it is
-- simply untagged, exactly like a legacy task. Never backfilled/guessed;
-- a null here is a genuine "generated before this field existed" or "no
-- target was selected at generation time" state, not an error.

ALTER TABLE seeding_comment_suggestions
  ADD COLUMN IF NOT EXISTS campaign_target_id uuid REFERENCES seeding_campaign_targets(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_seeding_comment_suggestions_campaign_target ON seeding_comment_suggestions(campaign_target_id);

-- Verification (run manually against Dev before/after applying, per the
-- project's existing schema-check convention — not executed by this
-- migration itself):
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'seeding_comment_suggestions' AND column_name = 'campaign_target_id';
-- SELECT indexname FROM pg_indexes WHERE tablename = 'seeding_comment_suggestions' AND indexname = 'idx_seeding_comment_suggestions_campaign_target';
