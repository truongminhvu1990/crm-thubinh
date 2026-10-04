-- Phase 1.6 Wave B0 - report_column_preferences: row-ownership RLS.
--
-- Replaces the broad "Allow full access to authenticated" policy (USING true / WITH CHECK true) with per-row
-- ownership: an authenticated user can only SELECT / INSERT / UPDATE / DELETE rows whose staff_id is THEIR OWN staff
-- record. The API route already derives staff_id from the session; this makes the database enforce it too.
--
-- Identity mapping = the same rule as money_debt_ledger_current_staff_id() and inventory_current_staff_id():
--   auth.uid() -> staff.auth_user_id, falling back to email only while staff.auth_user_id IS NULL.
-- The helper is SECURITY DEFINER with a pinned search_path so it reads public.staff regardless of the caller's own
-- RLS on staff (no policy recursion, no dependence on staff policies).
--
-- (SELECT fn()) makes PostgreSQL evaluate the helper once per statement instead of once per row.
-- anon has no policy and no access (its policy was dropped by 2026082301).
--
-- Rollback: recreate "Allow full access to authenticated" (FOR ALL TO authenticated USING (true) WITH CHECK (true))
-- and DROP FUNCTION public.report_preferences_current_staff_id().
-- Prepared in Wave B0; applied to the DEV project only. NOT applied to Production.

BEGIN;

CREATE OR REPLACE FUNCTION public.report_preferences_current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.staff s
  WHERE s.auth_user_id = auth.uid()
     OR (s.auth_user_id IS NULL AND s.email = (auth.jwt() ->> 'email'))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.report_preferences_current_staff_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_preferences_current_staff_id() TO authenticated;

DROP POLICY IF EXISTS "Allow full access to authenticated" ON public.report_column_preferences;
DROP POLICY IF EXISTS report_column_preferences_select_own ON public.report_column_preferences;
DROP POLICY IF EXISTS report_column_preferences_insert_own ON public.report_column_preferences;
DROP POLICY IF EXISTS report_column_preferences_update_own ON public.report_column_preferences;
DROP POLICY IF EXISTS report_column_preferences_delete_own ON public.report_column_preferences;

CREATE POLICY report_column_preferences_select_own ON public.report_column_preferences
  FOR SELECT TO authenticated
  USING (staff_id = (SELECT public.report_preferences_current_staff_id()));

CREATE POLICY report_column_preferences_insert_own ON public.report_column_preferences
  FOR INSERT TO authenticated
  WITH CHECK (staff_id = (SELECT public.report_preferences_current_staff_id()));

CREATE POLICY report_column_preferences_update_own ON public.report_column_preferences
  FOR UPDATE TO authenticated
  USING (staff_id = (SELECT public.report_preferences_current_staff_id()))
  WITH CHECK (staff_id = (SELECT public.report_preferences_current_staff_id()));

CREATE POLICY report_column_preferences_delete_own ON public.report_column_preferences
  FOR DELETE TO authenticated
  USING (staff_id = (SELECT public.report_preferences_current_staff_id()));

COMMIT;
