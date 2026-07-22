-- ============================================================================
-- PRODUCTION SCHEMA AUDIT — READ-ONLY
-- ============================================================================
-- Purpose: compare the live schema this script runs against (intended target:
-- Production) with the final expected schema derived from every migration in
-- supabase/migrations/.
--
-- SAFETY: every statement in this file is a SELECT. Nothing here inserts,
-- updates, deletes, or runs DDL. It is safe to run against Production as-is.
--
-- SCOPE / EXCLUSIONS — read before interpreting results:
--
-- 1. supabase/rejected_migrations/20260716_crm_baseline_orders_foundation.sql
--    is EXCLUDED. It was rejected/superseded and is not part of the intended
--    schema (confirmed: not referenced by any live table/column below).
--
-- 2. Orders module "clean design" tables/columns/indexes/policies sourced
--    ONLY from 20260712_orders_reset.sql and 20260716_orders_database_foundation.sql
--    are marked (BLOCKED - unapproved) below. Both files' own headers say
--    "NOT executed... Product Owner approval required first", and per project
--    history the Orders redesign remains an unapproved business spec. This
--    audit reports their live status for visibility only — do NOT include
--    them in an automatic deployment plan without explicit sign-off. This
--    covers: order_items, payments, order_events (as tables), and the
--    15-column "clean" orders design (the LIVE orders table is the legacy
--    table additively upgraded by 20260717_orders_table_upgrade.sql instead —
--    that upgrade IS in scope and audited normally, not flagged).
--
-- 3. audit_log (20260718_audit_log_foundation.sql), the 20260718 performance
--    indexes (20260718_performance_indexes.sql), and the "authenticated" RLS
--    policies (20260718_rls_authenticated_role.sql) are marked (DRAFTED -
--    not applied anywhere) below. Each file's own header says "DRAFTED ONLY.
--    NOT APPLIED" — meaning even Dev may not have these yet. Reported for
--    visibility; confirm intent before deploying.
--
-- 4. "teams" table: the task's known-facts list Production as missing a
--    `teams` table. NO migration in this repository creates a `teams` table,
--    and no application code queries one — `staff.team_id` (added by
--    20260729_permission_center_module.sql) is a plain `text` column, not a
--    foreign key to any `teams` table. This audit therefore does NOT check
--    for a `teams` table (there is nothing in the repo to compare against).
--    Flagged as an open question in the accompanying report rather than
--    invented as a migration.
--
-- Run the whole script. Each numbered section is an independent SELECT.
-- ============================================================================


-- ============================================================================
-- 1. MISSING TABLES
-- ============================================================================
WITH expected_tables(table_name, note) AS (
  VALUES
    ('customers', NULL), ('products', NULL), ('customer_purchases', NULL),
    ('master_data', NULL), ('tag_options', NULL), ('product_batches', NULL),
    ('product_images', NULL),
    ('orders', NULL),
    ('order_items', 'BLOCKED - unapproved Orders redesign, live shape undocumented'),
    ('payments', 'BLOCKED - unapproved Orders redesign'),
    ('order_events', 'BLOCKED - unapproved Orders redesign'),
    ('knowledge_entries', NULL),
    ('audit_log', 'DRAFTED - not applied anywhere per file header'),
    ('marketing_automations', NULL), ('marketing_automation_runs', NULL),
    ('marketing_automation_logs', NULL), ('marketing_campaign_automations', NULL),
    ('marketing_loyalty_rules', NULL), ('marketing_loyalty_transactions', NULL),
    ('marketing_vouchers', NULL),
    ('commission_rules', NULL), ('sales_commissions', NULL),
    ('staff', NULL), ('activity_logs', NULL),
    ('marketing_segments', NULL), ('marketing_segment_conditions', NULL),
    ('marketing_segment_members', NULL), ('marketing_campaigns', NULL),
    ('roles', NULL), ('permissions', NULL), ('role_permissions', NULL),
    ('role_data_scopes', NULL), ('permission_sensitive_fields', NULL)
)
SELECT
  'MISSING TABLE' AS gap_type,
  et.table_name,
  et.note
FROM expected_tables et
LEFT JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = et.table_name
WHERE t.table_name IS NULL
ORDER BY et.table_name;


-- ============================================================================
-- 2. MISSING COLUMNS
-- ============================================================================
WITH expected_columns(table_name, column_name) AS (
  VALUES
    -- customers
    ('customers','id'),('customers','customer_code'),('customers','full_name'),
    ('customers','phone'),('customers','facebook'),('customers','zalo'),
    ('customers','birthday'),('customers','address'),('customers','vip_level'),
    ('customers','source'),('customers','notes'),('customers','last_contacted'),
    ('customers','total_purchase'),('customers','gender'),('customers','occupation'),
    ('customers','country'),('customers','province'),('customers','district'),
    ('customers','wrist_size'),('customers','ring_size'),('customers','favorite_type'),
    ('customers','favorite_color'),('customers','preferred_origin'),('customers','budget'),
    ('customers','purpose'),('customers','assigned_salesperson'),
    ('customers','last_viewed_product'),('customers','created_at'),
    ('customers','updated_at'),('customers','next_reminder_date'),
    ('customers','next_reminder_priority'),('customers','customer_tags'),
    ('customers','customer_status'),('customers','next_followup_date'),
    ('customers','followup_note'),('customers','assigned_staff_id'),
    -- products
    ('products','id'),('products','sku'),('products','product_code'),
    ('products','category'),('products','product_name'),('products','status'),
    ('products','color'),('products','size'),('products','weight'),
    ('products','jade_grade'),('products','notes'),('products','origin'),
    ('products','jade_type'),('products','transparency'),('products','texture'),
    ('products','shape'),('products','wrist_size'),('products','ring_size'),
    ('products','cost_price'),('products','sale_price'),('products','discount'),
    ('products','location'),('products','certificate_no'),('products','supplier'),
    ('products','source'),('products','salesperson'),('products','image_url'),
    ('products','gallery'),('products','video'),('products','available'),
    ('products','reserved'),('products','sold'),('products','created_at'),
    ('products','updated_at'),('products','batch_id'),
    -- customer_purchases
    ('customer_purchases','id'),('customer_purchases','customer_id'),
    ('customer_purchases','product_id'),('customer_purchases','sale_price'),
    ('customer_purchases','sale_date'),('customer_purchases','note'),
    ('customer_purchases','source'),('customer_purchases','salesperson'),
    ('customer_purchases','created_at'),('customer_purchases','salesperson_id'),
    ('customer_purchases','entry_source'),('customer_purchases','created_by'),
    ('customer_purchases','updated_by'),('customer_purchases','updated_at'),
    -- master_data
    ('master_data','id'),('master_data','category'),('master_data','value'),
    ('master_data','sort_order'),('master_data','is_active'),('master_data','created_at'),
    -- tag_options
    ('tag_options','id'),('tag_options','category'),('tag_options','value'),
    ('tag_options','created_at'),
    -- product_batches
    ('product_batches','id'),('product_batches','batch_code'),
    ('product_batches','supplier'),('product_batches','received_date'),
    ('product_batches','return_due_date'),('product_batches','other_cost'),
    ('product_batches','notes'),('product_batches','status'),
    ('product_batches','created_at'),('product_batches','updated_at'),
    -- product_images
    ('product_images','id'),('product_images','product_id'),
    ('product_images','image_url'),('product_images','sort_order'),
    ('product_images','created_at'),
    -- orders (additive columns from 20260717_orders_table_upgrade.sql only;
    -- pre-existing legacy columns are not defined in any migration and are
    -- intentionally excluded from this check)
    ('orders','subtotal'),('orders','discount_total'),('orders','lost_reason'),
    ('orders','note'),('orders','sales_owner'),('orders','created_by'),
    ('orders','order_status'),('orders','payment_status'),
    ('orders','created_at'),('orders','updated_at'),('orders','order_number'),
    -- knowledge_entries
    ('knowledge_entries','id'),('knowledge_entries','title'),
    ('knowledge_entries','category'),('knowledge_entries','body'),
    ('knowledge_entries','tags'),('knowledge_entries','last_updated'),
    ('knowledge_entries','status'),
    -- audit_log (DRAFTED - not applied anywhere)
    ('audit_log','id'),('audit_log','occurred_at'),('audit_log','actor'),
    ('audit_log','action'),('audit_log','table_name'),('audit_log','record_id'),
    ('audit_log','changes'),('audit_log','request_path'),
    -- marketing_automations
    ('marketing_automations','id'),('marketing_automations','name'),
    ('marketing_automations','description'),('marketing_automations','automation_type'),
    ('marketing_automations','trigger_type'),('marketing_automations','frequency'),
    ('marketing_automations','target_segment_id'),('marketing_automations','status'),
    ('marketing_automations','version'),('marketing_automations','created_by'),
    ('marketing_automations','created_at'),('marketing_automations','updated_at'),
    -- marketing_automation_runs
    ('marketing_automation_runs','id'),('marketing_automation_runs','automation_id'),
    ('marketing_automation_runs','triggered_by'),('marketing_automation_runs','started_at'),
    ('marketing_automation_runs','finished_at'),('marketing_automation_runs','duration_ms'),
    ('marketing_automation_runs','status'),('marketing_automation_runs','error_message'),
    ('marketing_automation_runs','created_at'),
    -- marketing_automation_logs
    ('marketing_automation_logs','id'),('marketing_automation_logs','run_id'),
    ('marketing_automation_logs','customer_id'),('marketing_automation_logs','result'),
    ('marketing_automation_logs','message'),('marketing_automation_logs','created_at'),
    -- marketing_campaign_automations
    ('marketing_campaign_automations','id'),('marketing_campaign_automations','campaign_id'),
    ('marketing_campaign_automations','automation_id'),('marketing_campaign_automations','linked_by'),
    ('marketing_campaign_automations','linked_at'),
    -- marketing_loyalty_rules
    ('marketing_loyalty_rules','id'),('marketing_loyalty_rules','name'),
    ('marketing_loyalty_rules','description'),('marketing_loyalty_rules','points_value'),
    ('marketing_loyalty_rules','status'),('marketing_loyalty_rules','created_by'),
    ('marketing_loyalty_rules','created_at'),('marketing_loyalty_rules','updated_at'),
    -- marketing_loyalty_transactions
    ('marketing_loyalty_transactions','id'),('marketing_loyalty_transactions','customer_id'),
    ('marketing_loyalty_transactions','rule_id'),('marketing_loyalty_transactions','transaction_type'),
    ('marketing_loyalty_transactions','points'),('marketing_loyalty_transactions','note'),
    ('marketing_loyalty_transactions','created_by'),('marketing_loyalty_transactions','created_at'),
    -- marketing_vouchers
    ('marketing_vouchers','id'),('marketing_vouchers','code'),('marketing_vouchers','name'),
    ('marketing_vouchers','description'),('marketing_vouchers','status'),
    ('marketing_vouchers','customer_id'),('marketing_vouchers','start_date'),
    ('marketing_vouchers','end_date'),('marketing_vouchers','expires_at'),
    ('marketing_vouchers','created_by'),('marketing_vouchers','created_at'),
    ('marketing_vouchers','updated_at'),
    -- commission_rules
    ('commission_rules','id'),('commission_rules','minimum_amount'),
    ('commission_rules','maximum_amount'),('commission_rules','commission_percent'),
    ('commission_rules','is_active'),('commission_rules','created_at'),
    ('commission_rules','updated_at'),
    -- sales_commissions
    ('sales_commissions','id'),('sales_commissions','purchase_id'),
    ('sales_commissions','customer_id'),('sales_commissions','salesperson'),
    ('sales_commissions','salesperson_id'),('sales_commissions','sale_amount'),
    ('sales_commissions','commission_percent'),('sales_commissions','commission_amount'),
    ('sales_commissions','status'),('sales_commissions','paid_at'),
    ('sales_commissions','paid_by'),('sales_commissions','note'),
    ('sales_commissions','created_at'),
    -- staff
    ('staff','id'),('staff','staff_code'),('staff','full_name'),('staff','phone'),
    ('staff','email'),('staff','role'),('staff','status'),('staff','joined_date'),
    ('staff','avatar'),('staff','note'),('staff','created_at'),('staff','updated_at'),
    ('staff','team_id'),('staff','role_id'),('staff','auth_user_id'),
    -- activity_logs
    ('activity_logs','id'),('activity_logs','staff_id'),('activity_logs','action'),
    ('activity_logs','entity'),('activity_logs','entity_id'),('activity_logs','created_at'),
    -- marketing_segments
    ('marketing_segments','id'),('marketing_segments','name'),
    ('marketing_segments','description'),('marketing_segments','segment_type'),
    ('marketing_segments','condition_logic'),('marketing_segments','status'),
    ('marketing_segments','created_by'),('marketing_segments','created_at'),
    ('marketing_segments','updated_at'),
    -- marketing_segment_conditions
    ('marketing_segment_conditions','id'),('marketing_segment_conditions','segment_id'),
    ('marketing_segment_conditions','field'),('marketing_segment_conditions','operator'),
    ('marketing_segment_conditions','value'),('marketing_segment_conditions','sort_order'),
    -- marketing_segment_members
    ('marketing_segment_members','id'),('marketing_segment_members','segment_id'),
    ('marketing_segment_members','customer_id'),('marketing_segment_members','added_by'),
    ('marketing_segment_members','added_at'),
    -- marketing_campaigns
    ('marketing_campaigns','id'),('marketing_campaigns','name'),
    ('marketing_campaigns','description'),('marketing_campaigns','target_segment_id'),
    ('marketing_campaigns','start_date'),('marketing_campaigns','end_date'),
    ('marketing_campaigns','owner_staff_id'),('marketing_campaigns','status'),
    ('marketing_campaigns','created_at'),('marketing_campaigns','updated_at'),
    -- roles
    ('roles','id'),('roles','role_key'),('roles','name'),('roles','description'),
    ('roles','is_active'),('roles','created_at'),('roles','updated_at'),
    -- permissions
    ('permissions','id'),('permissions','permission_key'),('permissions','resource'),
    ('permissions','action'),('permissions','description'),('permissions','is_active'),
    ('permissions','created_at'),('permissions','updated_at'),
    -- role_permissions
    ('role_permissions','id'),('role_permissions','role_id'),
    ('role_permissions','permission_id'),('role_permissions','created_at'),
    -- role_data_scopes
    ('role_data_scopes','id'),('role_data_scopes','role_id'),
    ('role_data_scopes','resource'),('role_data_scopes','scope'),
    ('role_data_scopes','created_at'),('role_data_scopes','updated_at'),
    -- permission_sensitive_fields
    ('permission_sensitive_fields','id'),('permission_sensitive_fields','permission_key'),
    ('permission_sensitive_fields','field_key'),('permission_sensitive_fields','created_at')
)
SELECT
  'MISSING COLUMN' AS gap_type,
  ec.table_name,
  ec.column_name AS detail
FROM expected_columns ec
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = ec.table_name  -- only check columns on tables that exist
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = ec.table_name AND c.column_name = ec.column_name
WHERE c.column_name IS NULL
ORDER BY ec.table_name, ec.column_name;


-- ============================================================================
-- 3. MISSING INDEXES
-- ============================================================================
WITH expected_indexes(index_name, table_name, note) AS (
  VALUES
    ('idx_customer_purchases_customer_id','customer_purchases',NULL),
    ('product_batches_batch_code_ci_idx','product_batches',NULL),
    ('idx_products_batch_id','products',NULL),
    ('idx_product_images_product_id','product_images',NULL),
    ('idx_product_images_product_sort','product_images',NULL),
    ('idx_customers_phone','customers',NULL),
    ('idx_customers_customer_code','customers',NULL),
    ('idx_products_product_code','products',NULL),
    ('idx_products_sku','products',NULL),
    ('idx_orders_customer_id','orders',NULL),
    ('idx_orders_status_payment_status','orders',NULL),
    ('idx_orders_order_date','orders',NULL),
    ('idx_orders_sales_owner','orders',NULL),
    ('idx_audit_log_table_record','audit_log','DRAFTED - not applied anywhere'),
    ('idx_audit_log_occurred_at','audit_log','DRAFTED - not applied anywhere'),
    ('idx_customer_purchases_sale_date','customer_purchases',NULL),
    ('idx_customer_purchases_product_id','customer_purchases',NULL),
    ('idx_products_status','products','DRAFTED - not applied anywhere (20260718_performance_indexes.sql)'),
    ('idx_products_category','products','DRAFTED - not applied anywhere (20260718_performance_indexes.sql)'),
    ('idx_customers_vip_level','customers',NULL),
    ('idx_customers_assigned_salesperson','customers','DRAFTED - not applied anywhere (20260718_performance_indexes.sql)'),
    ('idx_customers_assigned_staff_id','customers',NULL),
    ('idx_customer_purchases_salesperson_id','customer_purchases',NULL),
    ('idx_staff_status','staff',NULL),
    ('idx_staff_role','staff',NULL),
    ('idx_activity_logs_staff_id','activity_logs',NULL),
    ('idx_activity_logs_entity','activity_logs',NULL),
    ('idx_activity_logs_created_at','activity_logs',NULL),
    ('idx_sales_commissions_customer_id','sales_commissions',NULL),
    ('idx_sales_commissions_status','sales_commissions',NULL),
    ('idx_sales_commissions_created_at','sales_commissions',NULL),
    ('idx_marketing_automations_status','marketing_automations',NULL),
    ('idx_marketing_automations_type','marketing_automations',NULL),
    ('idx_marketing_automations_segment_id','marketing_automations',NULL),
    ('idx_automation_runs_automation_id','marketing_automation_runs',NULL),
    ('idx_automation_runs_started_at','marketing_automation_runs',NULL),
    ('idx_automation_runs_status','marketing_automation_runs',NULL),
    ('idx_automation_logs_run_id','marketing_automation_logs',NULL),
    ('idx_automation_logs_customer_id','marketing_automation_logs',NULL),
    ('idx_automation_logs_result','marketing_automation_logs',NULL),
    ('idx_campaign_automations_campaign_id','marketing_campaign_automations',NULL),
    ('idx_campaign_automations_automation_id','marketing_campaign_automations',NULL),
    ('idx_loyalty_rules_status','marketing_loyalty_rules',NULL),
    ('idx_loyalty_transactions_customer_id','marketing_loyalty_transactions',NULL),
    ('idx_loyalty_transactions_created_at','marketing_loyalty_transactions',NULL),
    ('idx_loyalty_transactions_rule_id','marketing_loyalty_transactions',NULL),
    ('idx_vouchers_code','marketing_vouchers',NULL),
    ('idx_vouchers_status','marketing_vouchers',NULL),
    ('idx_vouchers_customer_id','marketing_vouchers',NULL),
    ('idx_marketing_segments_type','marketing_segments',NULL),
    ('idx_marketing_segments_status','marketing_segments',NULL),
    ('idx_segment_conditions_segment_id','marketing_segment_conditions',NULL),
    ('idx_segment_members_segment_id','marketing_segment_members',NULL),
    ('idx_segment_members_customer_id','marketing_segment_members',NULL),
    ('idx_campaigns_status','marketing_campaigns',NULL),
    ('idx_campaigns_target_segment_id','marketing_campaigns',NULL),
    ('idx_campaigns_owner_staff_id','marketing_campaigns',NULL),
    ('idx_campaigns_start_date','marketing_campaigns',NULL),
    ('idx_campaigns_end_date','marketing_campaigns',NULL),
    ('idx_customers_birthday','customers',NULL),
    ('idx_customers_province','customers',NULL),
    ('idx_customers_district','customers',NULL),
    ('idx_customer_purchases_entry_source','customer_purchases',NULL),
    ('idx_permissions_resource','permissions',NULL),
    ('idx_role_permissions_role_id','role_permissions',NULL),
    ('idx_role_permissions_permission_id','role_permissions',NULL),
    ('idx_role_data_scopes_role_id','role_data_scopes',NULL),
    ('idx_permission_sensitive_fields_permission_key','permission_sensitive_fields',NULL),
    ('idx_staff_team_id','staff',NULL),
    ('idx_staff_role_id','staff',NULL),
    ('staff_email_unique','staff',NULL)
)
SELECT
  'MISSING INDEX' AS gap_type,
  ei.table_name,
  ei.index_name || COALESCE(' — ' || ei.note, '') AS detail
FROM expected_indexes ei
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = ei.table_name
LEFT JOIN pg_indexes pi
  ON pi.schemaname = 'public' AND pi.indexname = ei.index_name
WHERE pi.indexname IS NULL
ORDER BY ei.table_name, ei.index_name;


-- ============================================================================
-- 4. MISSING CONSTRAINTS (PRIMARY KEY / UNIQUE / CHECK — foreign keys are in
--    section 5)
-- ============================================================================
WITH expected_constraints(constraint_name, table_name, contype, note) AS (
  VALUES
    ('customers_pkey','customers','p',NULL),
    ('customers_customer_code_key','customers','u',NULL),
    ('customers_phone_key','customers','u',NULL),
    ('products_pkey','products','p',NULL),
    ('products_product_code_key','products','u',NULL),
    ('customer_purchases_pkey','customer_purchases','p',NULL),
    ('customer_purchases_entry_source_check','customer_purchases','c',NULL),
    ('master_data_pkey','master_data','p',NULL),
    ('master_data_category_check','master_data','c',NULL),
    ('master_data_category_value_key','master_data','u',NULL),
    ('tag_options_pkey','tag_options','p',NULL),
    ('tag_options_category_check','tag_options','c',NULL),
    ('tag_options_category_value_key','tag_options','u','repaired 20260731 — verify present'),
    ('product_batches_pkey','product_batches','p',NULL),
    ('product_batches_status_check','product_batches','c',NULL),
    ('product_images_pkey','product_images','p',NULL),
    ('orders_order_status_check','orders','c',NULL),
    ('orders_payment_status_check','orders','c',NULL),
    ('orders_order_number_key','orders','u',NULL),
    ('staff_pkey','staff','p',NULL),
    ('staff_staff_code_key','staff','u',NULL),
    ('staff_auth_user_id_key','staff','u',NULL),
    ('marketing_automations_pkey','marketing_automations','p',NULL),
    ('marketing_automations_automation_type_check','marketing_automations','c',NULL),
    ('marketing_automations_trigger_type_check','marketing_automations','c',NULL),
    ('marketing_automations_frequency_check','marketing_automations','c',NULL),
    ('marketing_automations_status_check','marketing_automations','c',NULL),
    ('marketing_automations_version_check','marketing_automations','c',NULL),
    ('marketing_automation_runs_pkey','marketing_automation_runs','p',NULL),
    ('marketing_automation_runs_triggered_by_check','marketing_automation_runs','c',NULL),
    ('marketing_automation_runs_status_check','marketing_automation_runs','c',NULL),
    ('marketing_automation_logs_pkey','marketing_automation_logs','p',NULL),
    ('marketing_automation_logs_result_check','marketing_automation_logs','c',NULL),
    ('marketing_automation_logs_run_id_customer_id_key','marketing_automation_logs','u',NULL),
    ('marketing_campaign_automations_pkey','marketing_campaign_automations','p',NULL),
    ('marketing_campaign_automations_campaign_id_automation_id_key','marketing_campaign_automations','u',NULL),
    ('marketing_loyalty_rules_pkey','marketing_loyalty_rules','p',NULL),
    ('marketing_loyalty_rules_points_value_check','marketing_loyalty_rules','c',NULL),
    ('marketing_loyalty_rules_status_check','marketing_loyalty_rules','c',NULL),
    ('marketing_loyalty_transactions_pkey','marketing_loyalty_transactions','p',NULL),
    ('marketing_loyalty_transactions_transaction_type_check','marketing_loyalty_transactions','c',NULL),
    ('marketing_loyalty_transactions_points_check','marketing_loyalty_transactions','c',NULL),
    ('marketing_vouchers_pkey','marketing_vouchers','p',NULL),
    ('marketing_vouchers_status_check','marketing_vouchers','c',NULL),
    ('commission_rules_pkey','commission_rules','p',NULL),
    ('sales_commissions_pkey','sales_commissions','p',NULL),
    ('sales_commissions_purchase_id_key','sales_commissions','u',NULL),
    ('sales_commissions_status_check','sales_commissions','c',NULL),
    ('activity_logs_pkey','activity_logs','p',NULL),
    ('marketing_segments_pkey','marketing_segments','p',NULL),
    ('marketing_segments_segment_type_check','marketing_segments','c',NULL),
    ('marketing_segments_condition_logic_check','marketing_segments','c',NULL),
    ('marketing_segments_status_check','marketing_segments','c',NULL),
    ('marketing_segment_conditions_pkey','marketing_segment_conditions','p',NULL),
    ('marketing_segment_conditions_field_check','marketing_segment_conditions','c',NULL),
    ('marketing_segment_conditions_operator_check','marketing_segment_conditions','c',NULL),
    ('marketing_segment_members_pkey','marketing_segment_members','p',NULL),
    ('marketing_segment_members_segment_id_customer_id_key','marketing_segment_members','u',NULL),
    ('marketing_campaigns_pkey','marketing_campaigns','p',NULL),
    ('marketing_campaigns_status_check','marketing_campaigns','c',NULL),
    ('roles_pkey','roles','p',NULL),
    ('roles_role_key_key','roles','u',NULL),
    ('permissions_pkey','permissions','p',NULL),
    ('permissions_permission_key_key','permissions','u',NULL),
    ('role_permissions_pkey','role_permissions','p',NULL),
    ('role_permissions_role_id_permission_id_key','role_permissions','u',NULL),
    ('role_data_scopes_pkey','role_data_scopes','p',NULL),
    ('role_data_scopes_scope_check','role_data_scopes','c',NULL),
    ('role_data_scopes_role_id_resource_key','role_data_scopes','u',NULL),
    ('permission_sensitive_fields_pkey','permission_sensitive_fields','p',NULL),
    ('permission_sensitive_fields_field_key_check','permission_sensitive_fields','c',NULL),
    ('permission_sensitive_fields_permission_key_field_key_key','permission_sensitive_fields','u',NULL)
)
SELECT
  'MISSING CONSTRAINT' AS gap_type,
  ec.table_name,
  ec.constraint_name || ' (' ||
    CASE ec.contype WHEN 'p' THEN 'PRIMARY KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' END
    || ')' || COALESCE(' — ' || ec.note, '') AS detail
FROM expected_constraints ec
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = ec.table_name
LEFT JOIN pg_constraint pc
  ON pc.conrelid = (quote_ident(ec.table_name))::regclass
 AND pc.conname = ec.constraint_name
 AND pc.contype = ec.contype
WHERE pc.conname IS NULL
ORDER BY ec.table_name, ec.constraint_name;


-- ============================================================================
-- 5. MISSING FOREIGN KEYS
-- ============================================================================
WITH expected_fks(constraint_name, table_name, note) AS (
  VALUES
    ('customer_purchases_customer_id_fkey','customer_purchases',NULL),
    ('customer_purchases_product_id_fkey','customer_purchases',NULL),
    ('customer_purchases_salesperson_id_fkey','customer_purchases',NULL),
    ('product_images_product_id_fkey','product_images',NULL),
    ('products_batch_id_fkey','products',NULL),
    ('customers_assigned_staff_id_fkey','customers',NULL),
    ('marketing_automations_target_segment_id_fkey','marketing_automations',NULL),
    ('marketing_automations_created_by_fkey','marketing_automations',NULL),
    ('marketing_automation_runs_automation_id_fkey','marketing_automation_runs',NULL),
    ('marketing_automation_logs_run_id_fkey','marketing_automation_logs',NULL),
    ('marketing_automation_logs_customer_id_fkey','marketing_automation_logs',NULL),
    ('marketing_campaign_automations_campaign_id_fkey','marketing_campaign_automations',NULL),
    ('marketing_campaign_automations_automation_id_fkey','marketing_campaign_automations',NULL),
    ('marketing_campaign_automations_linked_by_fkey','marketing_campaign_automations',NULL),
    ('marketing_loyalty_rules_created_by_fkey','marketing_loyalty_rules',NULL),
    ('marketing_loyalty_transactions_customer_id_fkey','marketing_loyalty_transactions',NULL),
    ('marketing_loyalty_transactions_rule_id_fkey','marketing_loyalty_transactions',NULL),
    ('marketing_loyalty_transactions_created_by_fkey','marketing_loyalty_transactions',NULL),
    ('marketing_vouchers_customer_id_fkey','marketing_vouchers',NULL),
    ('marketing_vouchers_created_by_fkey','marketing_vouchers',NULL),
    ('staff_role_id_fkey','staff',NULL),
    ('activity_logs_staff_id_fkey','activity_logs',NULL),
    ('marketing_segments_created_by_fkey','marketing_segments',NULL),
    ('marketing_segment_conditions_segment_id_fkey','marketing_segment_conditions',NULL),
    ('marketing_segment_members_segment_id_fkey','marketing_segment_members',NULL),
    ('marketing_segment_members_customer_id_fkey','marketing_segment_members',NULL),
    ('marketing_segment_members_added_by_fkey','marketing_segment_members',NULL),
    ('marketing_campaigns_target_segment_id_fkey','marketing_campaigns',NULL),
    ('marketing_campaigns_owner_staff_id_fkey','marketing_campaigns',NULL),
    ('role_permissions_role_id_fkey','role_permissions',NULL),
    ('role_permissions_permission_id_fkey','role_permissions',NULL),
    ('role_data_scopes_role_id_fkey','role_data_scopes',NULL),
    ('permission_sensitive_fields_permission_key_fkey','permission_sensitive_fields',NULL)
    -- Note: sales_commissions.purchase_id / customer_id are deliberately NOT
    -- foreign keys (immutable-snapshot design, stated explicitly in
    -- 20260721_sales_commission_module.sql) — correctly excluded here.
)
SELECT
  'MISSING FOREIGN KEY' AS gap_type,
  efk.table_name,
  efk.constraint_name || COALESCE(' — ' || efk.note, '') AS detail
FROM expected_fks efk
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = efk.table_name
LEFT JOIN pg_constraint pc
  ON pc.conrelid = (quote_ident(efk.table_name))::regclass
 AND pc.conname = efk.constraint_name
 AND pc.contype = 'f'
WHERE pc.conname IS NULL
ORDER BY efk.table_name, efk.constraint_name;
-- NOTE: exact FK constraint names above are Postgres's default
-- `<table>_<column>_fkey` naming, inferred from column lists since the
-- migrations mostly don't name FKs explicitly. If Production named any of
-- these differently, this section will show a false positive for that one
-- row — cross-check against section 2 (would the column itself be missing?)
-- before treating it as a real gap.


-- ============================================================================
-- 6. MISSING RLS POLICIES (+ RLS-enabled flag)
-- ============================================================================
WITH expected_rls_tables(table_name, note) AS (
  VALUES
    ('customers',NULL),('products',NULL),('customer_purchases',NULL),
    ('master_data',NULL),('tag_options',NULL),('product_batches',NULL),
    ('product_images',NULL),('orders',NULL),
    ('audit_log','DRAFTED - not applied anywhere'),
    ('marketing_automations',NULL),('marketing_automation_runs',NULL),
    ('marketing_automation_logs',NULL),('marketing_campaign_automations',NULL),
    ('marketing_loyalty_rules',NULL),('marketing_loyalty_transactions',NULL),
    ('marketing_vouchers',NULL),
    ('commission_rules',NULL),('sales_commissions',NULL),
    ('staff',NULL),('activity_logs',NULL),
    ('marketing_segments',NULL),('marketing_segment_conditions',NULL),
    ('marketing_segment_members',NULL),('marketing_campaigns',NULL),
    ('roles',NULL),('permissions',NULL),('role_permissions',NULL),
    ('role_data_scopes',NULL),('permission_sensitive_fields',NULL)
    -- knowledge_entries deliberately excluded — RLS intentionally NOT enabled
    -- per 20260717_knowledge_vault_module.sql
),
rls_status AS (
  SELECT
    'RLS NOT ENABLED' AS gap_type,
    ert.table_name,
    COALESCE(ert.note, 'expected ENABLE ROW LEVEL SECURITY') AS detail
  FROM expected_rls_tables ert
  JOIN pg_class c ON c.relname = ert.table_name AND c.relnamespace = 'public'::regnamespace
  WHERE c.relrowsecurity = false
),
expected_policies(policy_name, table_name, note) AS (
  VALUES
    ('Allow full access to anon','customers',NULL),
    ('Allow full access to authenticated','customers','DRAFTED - not applied anywhere (20260718_rls_authenticated_role.sql)'),
    ('Allow full access to anon','products',NULL),
    ('Allow full access to authenticated','products','DRAFTED - not applied anywhere'),
    ('Allow full access','customer_purchases',NULL),
    ('Allow full access to authenticated','customer_purchases','DRAFTED - not applied anywhere'),
    ('Allow full access to anon','master_data',NULL),
    ('Allow full access to authenticated','master_data','DRAFTED - not applied anywhere'),
    ('Allow full access to anon','tag_options',NULL),
    ('Allow full access to authenticated','tag_options','DRAFTED - not applied anywhere'),
    ('Allow full access to anon','product_batches',NULL),
    ('Allow full access to authenticated','product_batches','DRAFTED - not applied anywhere'),
    ('Allow full access to anon','product_images',NULL),
    ('Allow full access to authenticated','product_images','DRAFTED - not applied anywhere'),
    ('Allow full access','orders',NULL),
    ('Allow full access to authenticated','orders','DRAFTED - not applied anywhere'),
    ('Allow insert to authenticated','audit_log','DRAFTED - not applied anywhere'),
    ('Allow read to authenticated','audit_log','DRAFTED - not applied anywhere'),
    ('Allow full access to anon','marketing_automations',NULL),
    ('Allow full access to authenticated','marketing_automations',NULL),
    ('Allow full access to anon','marketing_automation_runs',NULL),
    ('Allow full access to authenticated','marketing_automation_runs',NULL),
    ('Allow full access to anon','marketing_automation_logs',NULL),
    ('Allow full access to authenticated','marketing_automation_logs',NULL),
    ('Allow full access to anon','marketing_campaign_automations',NULL),
    ('Allow full access to authenticated','marketing_campaign_automations',NULL),
    ('Allow full access to anon','marketing_loyalty_rules',NULL),
    ('Allow full access to authenticated','marketing_loyalty_rules',NULL),
    ('Allow full access to anon','marketing_loyalty_transactions',NULL),
    ('Allow full access to authenticated','marketing_loyalty_transactions',NULL),
    ('Allow full access to anon','marketing_vouchers',NULL),
    ('Allow full access to authenticated','marketing_vouchers',NULL),
    ('Allow full access','commission_rules',NULL),
    ('Allow full access to authenticated','commission_rules',NULL),
    ('Allow full access','sales_commissions',NULL),
    ('Allow full access to authenticated','sales_commissions',NULL),
    ('Allow full access to anon','staff',NULL),
    ('Allow full access to authenticated','staff',NULL),
    ('Allow full access to anon','activity_logs',NULL),
    ('Allow full access to authenticated','activity_logs',NULL),
    ('Allow full access to anon','marketing_segments',NULL),
    ('Allow full access to authenticated','marketing_segments',NULL),
    ('Allow full access to anon','marketing_segment_conditions',NULL),
    ('Allow full access to authenticated','marketing_segment_conditions',NULL),
    ('Allow full access to anon','marketing_segment_members',NULL),
    ('Allow full access to authenticated','marketing_segment_members',NULL),
    ('Allow full access to anon','marketing_campaigns',NULL),
    ('Allow full access to authenticated','marketing_campaigns',NULL),
    ('Allow full access to anon','roles',NULL),
    ('Allow full access to authenticated','roles',NULL),
    ('Allow full access to anon','permissions',NULL),
    ('Allow full access to authenticated','permissions',NULL),
    ('Allow full access to anon','role_permissions',NULL),
    ('Allow full access to authenticated','role_permissions',NULL),
    ('Allow full access to anon','role_data_scopes',NULL),
    ('Allow full access to authenticated','role_data_scopes',NULL),
    ('Allow full access to anon','permission_sensitive_fields',NULL),
    ('Allow full access to authenticated','permission_sensitive_fields',NULL)
),
missing_policies AS (
  SELECT
    'MISSING RLS POLICY' AS gap_type,
    ep.table_name,
    ep.policy_name || COALESCE(' — ' || ep.note, '') AS detail
  FROM expected_policies ep
  JOIN information_schema.tables t
    ON t.table_schema = 'public' AND t.table_name = ep.table_name
  LEFT JOIN pg_policies pp
    ON pp.schemaname = 'public' AND pp.tablename = ep.table_name AND pp.policyname = ep.policy_name
  WHERE pp.policyname IS NULL
)
SELECT * FROM rls_status
UNION ALL
SELECT * FROM missing_policies
ORDER BY 1, 2;


-- ============================================================================
-- 7. MISSING TRIGGERS
-- ============================================================================
WITH expected_triggers(trigger_name, table_name, function_name) AS (
  VALUES
    ('customers_set_updated_at','customers','set_customers_updated_at'),
    ('products_set_updated_at','products','set_customers_updated_at'),
    ('product_batches_set_updated_at','product_batches','set_customers_updated_at'),
    ('knowledge_entries_set_last_updated','knowledge_entries','set_knowledge_entries_last_updated'),
    ('customer_purchases_set_updated_at','customer_purchases','set_customers_updated_at'),
    ('marketing_automations_set_updated_at','marketing_automations','set_customers_updated_at'),
    ('marketing_loyalty_rules_set_updated_at','marketing_loyalty_rules','set_customers_updated_at'),
    ('marketing_vouchers_set_updated_at','marketing_vouchers','set_customers_updated_at'),
    ('marketing_segments_set_updated_at','marketing_segments','set_customers_updated_at'),
    ('marketing_campaigns_set_updated_at','marketing_campaigns','set_customers_updated_at')
)
SELECT
  'MISSING TRIGGER' AS gap_type,
  et.table_name,
  et.trigger_name || ' (calls ' || et.function_name || '())' AS detail
FROM expected_triggers et
JOIN information_schema.tables t
  ON t.table_schema = 'public' AND t.table_name = et.table_name
LEFT JOIN information_schema.triggers tr
  ON tr.event_object_schema = 'public' AND tr.event_object_table = et.table_name
 AND tr.trigger_name = et.trigger_name
WHERE tr.trigger_name IS NULL
ORDER BY et.table_name, et.trigger_name;


-- ============================================================================
-- 8. MISSING FUNCTIONS
-- ============================================================================
WITH expected_functions(function_name, note) AS (
  VALUES
    ('set_customers_updated_at', NULL),
    ('set_knowledge_entries_last_updated', NULL),
    ('reports_revenue_periods', NULL),
    ('reports_revenue_summary', NULL),
    ('reports_product_analysis', NULL),
    ('reports_category_analysis', NULL),
    ('reports_customer_summary', NULL),
    ('reports_top_customers', NULL),
    ('reports_staff_analysis', NULL),
    ('reports_revenue_trend', NULL),
    ('verification_dashboard', NULL),
    ('marketing_next_birthday_occurrence', NULL),
    ('marketing_match_condition', 'final def is the 20260728 CREATE OR REPLACE, not the original 20260727 one'),
    ('marketing_segment_match_ids', NULL),
    ('marketing_segment_customer_count', NULL),
    ('marketing_segment_customer_list', NULL),
    ('marketing_dashboard_counts', NULL),
    ('marketing_birthday_customers', NULL)
)
SELECT
  'MISSING FUNCTION' AS gap_type,
  NULL::text AS table_name,
  ef.function_name || COALESCE(' — ' || ef.note, '') AS detail
FROM expected_functions ef
LEFT JOIN pg_proc p
  ON p.proname = ef.function_name AND p.pronamespace = 'public'::regnamespace
WHERE p.proname IS NULL
ORDER BY ef.function_name;


-- ============================================================================
-- 9. BONUS — sales_ledger view (not one of the 8 requested categories, but
--    load-bearing for Reports/Data Verification; flagged separately so it
--    isn't silently missed)
-- ============================================================================
SELECT
  'MISSING VIEW (informational)' AS gap_type,
  NULL::text AS table_name,
  'sales_ledger — final def from 20260725_data_verification_module.sql CREATE OR REPLACE' AS detail
WHERE NOT EXISTS (
  SELECT 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'sales_ledger'
);
