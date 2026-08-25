-- Phase 2F — AI-Powered Evidence Reconciliation. Content-only evidence
-- reconciliation for Comment tasks: deterministic exact-match first, a
-- bounded AI semantic-match fallback second. NEVER identity verification —
-- this only ever answers "does matching content exist on the target post,"
-- never "who wrote it." seeding_tasks itself is NOT altered by this
-- migration — evidence lives entirely in its own tables so task
-- status/result_note can never be touched by this feature, structurally,
-- not just by convention.
--
-- Two-table hybrid (PO-locked architecture, 2026-08-26):
--   seeding_task_evidence_results = current state, 1 row per task (upsert)
--   seeding_task_evidence_checks  = append-only history, 1 row per run ever
--
-- Additive/non-destructive throughout: no column dropped, no row deleted,
-- no existing table altered.

BEGIN;

-- ============================================================
-- 1. seeding_task_evidence_results — current state (1 row/task)
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_task_evidence_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id uuid NOT NULL REFERENCES seeding_tasks(id) ON DELETE CASCADE,

  -- App-validated enum (no CHECK constraint — consistent with
  -- seeding_tasks.status/action_type's existing app-layer-only validation
  -- convention): 'Exact Match' | 'AI Match (High Confidence)' | 'Ambiguous'
  -- | 'Not Found' | 'Partial Evidence' | 'Evidence Unavailable' |
  -- 'Reconnect Required'.
  result text NOT NULL,

  -- Informational only — never presented as identity, never used to imply
  -- who wrote anything. The real Facebook comment id + a short cached text
  -- snippet, so a manager can click through to context.
  matched_comment_id text,
  matched_comment_snippet text,

  -- AI's own self-reported confidence tier ('high'|'medium'|'low'), null
  -- when the result came from deterministic matching alone.
  confidence text,

  -- Idempotency (PO-locked, §7): a batch round skips re-fetching Facebook
  -- and re-calling AI for a task whose current inputs hash identically to
  -- this row's — enforced by the candidate-selection query in
  -- seedingEvidenceReconciliation.service.ts, not a DB constraint.
  comment_text_hash text NOT NULL,
  evidence_snapshot_hash text,
  model_version text,
  prompt_version text,

  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by_staff_id uuid REFERENCES staff(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_seeding_task_evidence_results_task
  ON seeding_task_evidence_results(task_id);
CREATE INDEX IF NOT EXISTS idx_seeding_task_evidence_results_result
  ON seeding_task_evidence_results(result);

DROP TRIGGER IF EXISTS seeding_task_evidence_results_set_updated_at ON seeding_task_evidence_results;
CREATE TRIGGER seeding_task_evidence_results_set_updated_at
BEFORE UPDATE ON seeding_task_evidence_results
FOR EACH ROW EXECUTE FUNCTION set_customers_updated_at();

ALTER TABLE seeding_task_evidence_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_task_evidence_results;
CREATE POLICY "Allow full access to anon" ON seeding_task_evidence_results
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_task_evidence_results;
CREATE POLICY "Allow full access to authenticated" ON seeding_task_evidence_results
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. seeding_task_evidence_checks — append-only history
-- ============================================================

CREATE TABLE IF NOT EXISTS seeding_task_evidence_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  task_id uuid NOT NULL REFERENCES seeding_tasks(id) ON DELETE CASCADE,

  result text NOT NULL,
  matched_comment_id text,
  matched_comment_snippet text,
  confidence text,

  comment_text_hash text NOT NULL,
  evidence_snapshot_hash text,
  model_version text,
  prompt_version text,

  checked_at timestamptz NOT NULL DEFAULT now(),
  checked_by_staff_id uuid REFERENCES staff(id)
);

CREATE INDEX IF NOT EXISTS idx_seeding_task_evidence_checks_task_checked
  ON seeding_task_evidence_checks(task_id, checked_at);

ALTER TABLE seeding_task_evidence_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow full access to anon" ON seeding_task_evidence_checks;
CREATE POLICY "Allow full access to anon" ON seeding_task_evidence_checks
  FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow full access to authenticated" ON seeding_task_evidence_checks;
CREATE POLICY "Allow full access to authenticated" ON seeding_task_evidence_checks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMIT;

-- ============================================================
-- Verification (read-only, run after applying):
-- ============================================================
-- SELECT table_name FROM information_schema.tables WHERE table_name IN ('seeding_task_evidence_results','seeding_task_evidence_checks');
-- SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE tablename IN ('seeding_task_evidence_results','seeding_task_evidence_checks');
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('seeding_task_evidence_results','seeding_task_evidence_checks');
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'seeding_tasks' AND column_name LIKE '%evidence%'; -- expect 0 rows: seeding_tasks untouched
