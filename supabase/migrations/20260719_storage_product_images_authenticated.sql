-- Production Storage Bug — authenticated uploads to product-images rejected
-- by RLS. Root cause: storage.objects policies for this bucket are scoped
-- `TO anon` only (see 20260714_product_images_v1.sql). A signed-in user's
-- session resolves to Postgres role `authenticated`, not `anon`, so every
-- INSERT/UPDATE/DELETE from an authenticated session has zero matching
-- policy and is rejected — same class of bug as
-- 20260718_rls_authenticated_role.sql, but on storage.objects instead of
-- the public schema tables, which that migration did not cover.
--
-- Fix: add an identical `TO authenticated` policy alongside each existing
-- `TO anon` policy for bucket product-images, same
-- `bucket_id = 'product-images'` condition. Purely additive — no existing
-- policy is dropped or edited, no application code, upload logic, or public
-- read policy is touched.

BEGIN;

DROP POLICY IF EXISTS "Authenticated upload product-images" ON storage.objects;
CREATE POLICY "Authenticated upload product-images" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated update product-images" ON storage.objects;
CREATE POLICY "Authenticated update product-images" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated delete product-images" ON storage.objects;
CREATE POLICY "Authenticated delete product-images" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');

COMMIT;

-- Verification (read-only, run after applying):
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND (qual::text LIKE '%product-images%' OR with_check::text LIKE '%product-images%')
ORDER BY cmd, policyname;
-- Expect 6 rows total for bucket product-images:
--   SELECT | {public}          | "Public read product-images"        (unchanged)
--   INSERT | {anon}            | "Anon upload product-images"        (unchanged)
--   INSERT | {authenticated}   | "Authenticated upload product-images" (new)
--   UPDATE | {anon}            | "Anon update product-images"        (unchanged)
--   UPDATE | {authenticated}   | "Authenticated update product-images" (new)
--   DELETE | {anon}            | "Anon delete product-images"        (unchanged)
--   DELETE | {authenticated}   | "Authenticated delete product-images" (new)
