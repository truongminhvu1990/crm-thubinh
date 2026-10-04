-- Phase 1.6 Wave B0 - Reporting Column Management: column ORDER persistence.
--
-- Adds ONE nullable column to report_column_preferences. Nothing else changes:
--   * no default, no backfill, no data rewrite - every existing row keeps its visible_columns untouched
--   * NULL = legacy row (never saved in the new format); the application treats it with the pre-Wave-B semantics
--   * idempotent (IF NOT EXISTS) - Dev already has this column from an earlier experiment
--   * backward compatible: application code that does not know about the column keeps working, and the new code
--     falls back to the legacy shape when the column is missing (see reportPreferences.repository.ts)
--
-- This is NOT 2026081804_report_column_preferences_order.sql, which exists only on the reconciliation branches.
--
-- Rollout: apply to Production BEFORE deploying the application that writes column_order.
-- Rollback: not needed (a nullable, unused column is harmless).
-- Prepared in Wave B0; NOT applied to Production.

ALTER TABLE public.report_column_preferences
  ADD COLUMN IF NOT EXISTS column_order jsonb;

COMMENT ON COLUMN public.report_column_preferences.column_order IS
  'Ordered array of ALL column keys known at save time (visible and hidden). NULL = legacy row / no saved order.';
