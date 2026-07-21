-- Reports BI Center Dev Seed — Sprint v2.2.0 Revision 1, "UAT DATA" section.
--
-- Development only. NEVER run against Production — this file lives in
-- supabase/seed/ (same convention as 20260719_uat_minimal_seed.sql), not
-- supabase/migrations/, specifically so it is never picked up by
-- `supabase db push` or any migration pipeline. Apply manually with
-- `supabase db query --linked -f` against the Dev project only.
--
-- All new rows use explicit, fixed UUIDs (same technique as this sprint's
-- own RPC verification script) purely so every cross-reference below is a
-- literal, auditable at a glance - not because these entities are real.
--
-- 30 customer_purchases, spread across explicit calendar buckets (Today /
-- This Week / This Month / Last Month / Last Quarter / Last Year) using
-- CURRENT_DATE-relative math so the seed stays correct no matter what day
-- it's actually applied - covering every comparison period Decision 18/19
-- needs (This Month vs Last Month, This Quarter vs Last Quarter, This Year
-- vs Last Year). `note` distinguishes "Live Sale" (created_at same day as
-- sale_date - entered as it happened) from "Historical Import" (created_at
-- = now(), backfilled long after an old sale_date) per the task's explicit
-- requirement for both. 22 of the 30 get a sales_commissions row, cycling
-- Pending/Approved/Paid; one purchase (id ...08) deliberately has no
-- salesperson_id (and so no commission) and one (id ...15) deliberately
-- has no product_id (exercises the "Chưa xác định" category fallback) -
-- both edge cases this sprint's RPC functions are already written to
-- handle, not new to this seed.

BEGIN;

-- ============================================================
-- 1. MASTER DATA — two more product categories (Vòng tay already exists).
-- ============================================================

INSERT INTO master_data (category, value, sort_order, is_active) VALUES
  ('product_category', 'Nhẫn', 1, true),
  ('product_category', 'Dây chuyền', 2, true);

-- ============================================================
-- 2. STAFF — 3 rows (table was empty).
-- ============================================================

INSERT INTO staff (id, staff_code, full_name, role, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'NV001', 'Nguyễn Thị Lan', 'Sales', 'Active'),
  ('a1000000-0000-0000-0000-000000000002', 'NV002', 'Phạm Văn Hùng', 'Sales', 'Active'),
  ('a1000000-0000-0000-0000-000000000003', 'NV003', 'Đỗ Thị Mai', 'Manager', 'Active');

-- ============================================================
-- 3. CUSTOMERS — 4 more (KH0001/KH0002 already exist from the earlier
--    minimal UAT seed; the other two pre-existing rows, "1"/"44444", look
--    like ad-hoc manual test junk, not seed-managed, so purchases below
--    don't reference them).
-- ============================================================

INSERT INTO customers (id, customer_code, full_name, phone) VALUES
  ('b1000000-0000-0000-0000-000000000003', 'KH0003', 'Nguyễn Thị Bích', '0901000003'),
  ('b1000000-0000-0000-0000-000000000004', 'KH0004', 'Trần Văn Đức', '0901000004'),
  ('b1000000-0000-0000-0000-000000000005', 'KH0005', 'Lê Thị Hương', '0901000005'),
  ('b1000000-0000-0000-0000-000000000006', 'KH0006', 'Vũ Văn Nam', '0901000006');

-- ============================================================
-- 4. PRODUCTS — 4 more, in the 2 new categories (SP0001-SP0003 + "1111"
--    already exist, all "Vòng tay").
-- ============================================================

INSERT INTO products (id, product_code, category, product_name, status, sale_price) VALUES
  ('c1000000-0000-0000-0000-000000000004', 'SP0004', 'Nhẫn', 'Nhẫn ngọc bích D', 'Sold', 3500000),
  ('c1000000-0000-0000-0000-000000000005', 'SP0005', 'Nhẫn', 'Nhẫn ngọc bích E', 'Sold', 8500000),
  ('c1000000-0000-0000-0000-000000000006', 'SP0006', 'Dây chuyền', 'Dây chuyền ngọc bích F', 'Sold', 12000000),
  ('c1000000-0000-0000-0000-000000000007', 'SP0007', 'Dây chuyền', 'Dây chuyền ngọc bích G', 'Sold', 18000000);

-- ============================================================
-- 5. CUSTOMER_PURCHASES — 30 rows.
-- ============================================================

INSERT INTO customer_purchases (id, customer_id, product_id, sale_price, sale_date, salesperson_id, salesperson, note, created_at) VALUES
  -- Today (Live Sale)
  ('d1000000-0000-0000-0000-000000000001', 'a29df4e1-a58b-470f-a010-4655036d25e8', '9bd25a0c-db71-4d8e-98e5-94966a5af094', 15000000, CURRENT_DATE, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Live Sale', CURRENT_DATE + INTERVAL '10 hours'),
  ('d1000000-0000-0000-0000-000000000002', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', '30515688-6dac-42f6-8c0e-282c0ff8bc00', 20000000, CURRENT_DATE, 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE + INTERVAL '11 hours'),

  -- This week, not today (Live Sale)
  ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000003', 'e856ddeb-1720-4d03-92eb-e248890810c6', 25000000, CURRENT_DATE - INTERVAL '1 day', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Live Sale', CURRENT_DATE - INTERVAL '1 day' + INTERVAL '14 hours'),
  ('d1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004', '47031129-c01f-44f4-80e1-c51e9017d991', 2000000, CURRENT_DATE - INTERVAL '3 days', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Live Sale', CURRENT_DATE - INTERVAL '3 days' + INTERVAL '9 hours'),
  ('d1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000004', 3500000, CURRENT_DATE - INTERVAL '5 days', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE - INTERVAL '5 days' + INTERVAL '15 hours'),

  -- This month, before this week (Live Sale)
  ('d1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000005', 8500000, CURRENT_DATE - INTERVAL '10 days', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Live Sale', CURRENT_DATE - INTERVAL '10 days' + INTERVAL '13 hours'),
  ('d1000000-0000-0000-0000-000000000007', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'c1000000-0000-0000-0000-000000000006', 12000000, CURRENT_DATE - INTERVAL '13 days', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Live Sale', CURRENT_DATE - INTERVAL '13 days' + INTERVAL '10 hours'),
  ('d1000000-0000-0000-0000-000000000008', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'c1000000-0000-0000-0000-000000000007', 18000000, CURRENT_DATE - INTERVAL '16 days', NULL, NULL, 'Live Sale', CURRENT_DATE - INTERVAL '16 days' + INTERVAL '16 hours'),
  ('d1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000003', '9bd25a0c-db71-4d8e-98e5-94966a5af094', 15000000, CURRENT_DATE - INTERVAL '19 days', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE - INTERVAL '19 days' + INTERVAL '11 hours'),

  -- Last month (Historical Import - backfilled, created_at = now())
  ('d1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000004', '30515688-6dac-42f6-8c0e-282c0ff8bc00', 20000000, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '3 days')::date, 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000005', 'e856ddeb-1720-4d03-92eb-e248890810c6', 25000000, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '8 days')::date, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000006', '47031129-c01f-44f4-80e1-c51e9017d991', 2000000, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '13 days')::date, 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000013', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'c1000000-0000-0000-0000-000000000004', 3500000, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '18 days')::date, 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000014', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'c1000000-0000-0000-0000-000000000005', 8500000, (date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' + INTERVAL '23 days')::date, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Historical Import', now()),

  -- Last quarter (Historical Import)
  ('d1000000-0000-0000-0000-000000000015', 'b1000000-0000-0000-0000-000000000003', NULL, 5000000, (date_trunc('quarter', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '5 days')::date, 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000016', 'b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000006', 12000000, (date_trunc('quarter', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '20 days')::date, 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000017', 'b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000007', 18000000, (date_trunc('quarter', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '40 days')::date, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000018', 'b1000000-0000-0000-0000-000000000006', '9bd25a0c-db71-4d8e-98e5-94966a5af094', 15000000, (date_trunc('quarter', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '60 days')::date, 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000019', 'a29df4e1-a58b-470f-a010-4655036d25e8', '30515688-6dac-42f6-8c0e-282c0ff8bc00', 20000000, (date_trunc('quarter', CURRENT_DATE) - INTERVAL '3 months' + INTERVAL '80 days')::date, 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Historical Import', now()),

  -- Last year (Historical Import)
  ('d1000000-0000-0000-0000-000000000020', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'e856ddeb-1720-4d03-92eb-e248890810c6', 25000000, (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year' + INTERVAL '10 days')::date, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000003', '47031129-c01f-44f4-80e1-c51e9017d991', 2000000, (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year' + INTERVAL '100 days')::date, 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000022', 'b1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000004', 3500000, (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year' + INTERVAL '200 days')::date, 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Historical Import', now()),
  ('d1000000-0000-0000-0000-000000000023', 'b1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000005', 8500000, (date_trunc('year', CURRENT_DATE) - INTERVAL '1 year' + INTERVAL '300 days')::date, 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Historical Import', now()),

  -- More this-month volume (Live Sale)
  ('d1000000-0000-0000-0000-000000000024', 'b1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000006', 12000000, CURRENT_DATE - INTERVAL '6 days', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE - INTERVAL '6 days' + INTERVAL '9 hours'),
  ('d1000000-0000-0000-0000-000000000025', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'c1000000-0000-0000-0000-000000000007', 18000000, CURRENT_DATE - INTERVAL '8 days', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Live Sale', CURRENT_DATE - INTERVAL '8 days' + INTERVAL '10 hours'),
  ('d1000000-0000-0000-0000-000000000026', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', '9bd25a0c-db71-4d8e-98e5-94966a5af094', 15000000, CURRENT_DATE - INTERVAL '11 days', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Live Sale', CURRENT_DATE - INTERVAL '11 days' + INTERVAL '15 hours'),
  ('d1000000-0000-0000-0000-000000000027', 'b1000000-0000-0000-0000-000000000003', '30515688-6dac-42f6-8c0e-282c0ff8bc00', 20000000, CURRENT_DATE - INTERVAL '14 days', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE - INTERVAL '14 days' + INTERVAL '12 hours'),
  ('d1000000-0000-0000-0000-000000000028', 'b1000000-0000-0000-0000-000000000004', 'e856ddeb-1720-4d03-92eb-e248890810c6', 25000000, CURRENT_DATE - INTERVAL '17 days', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 'Live Sale', CURRENT_DATE - INTERVAL '17 days' + INTERVAL '13 hours'),
  ('d1000000-0000-0000-0000-000000000029', 'b1000000-0000-0000-0000-000000000005', '47031129-c01f-44f4-80e1-c51e9017d991', 2000000, CURRENT_DATE - INTERVAL '2 days', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 'Live Sale', CURRENT_DATE - INTERVAL '2 days' + INTERVAL '17 hours'),
  ('d1000000-0000-0000-0000-000000000030', 'b1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000004', 3500000, CURRENT_DATE - INTERVAL '9 days', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 'Live Sale', CURRENT_DATE - INTERVAL '9 days' + INTERVAL '14 hours');

-- ============================================================
-- 6. SALES_COMMISSIONS — 22 of the 30 (purchases 03, 07, 08, 12, 17, 22,
--    26, 30 deliberately have none; 08 has no salesperson at all).
--    commission_percent matches commission_rules (>=10,000,000 -> 3%,
--    else 5%), cycling status Pending/Approved/Paid.
-- ============================================================

INSERT INTO sales_commissions (id, purchase_id, customer_id, salesperson_id, salesperson, sale_amount, commission_percent, commission_amount, status, paid_at, paid_by) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 15000000, 3, 450000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 20000000, 3, 600000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 2000000, 5, 100000, 'Paid', now(), 'Nguyễn Thị Lan'),
  ('e1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 3500000, 5, 175000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000006', 'b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 8500000, 5, 425000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000009', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 15000000, 3, 450000, 'Paid', now(), 'Phạm Văn Hùng'),
  ('e1000000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000010', 'b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 20000000, 3, 600000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000011', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 25000000, 3, 750000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000013', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 3500000, 5, 175000, 'Paid', now(), 'Đỗ Thị Mai'),
  ('e1000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000014', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 8500000, 5, 425000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000015', 'd1000000-0000-0000-0000-000000000015', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 5000000, 5, 250000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000016', 'd1000000-0000-0000-0000-000000000016', 'b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 12000000, 3, 360000, 'Paid', now(), 'Đỗ Thị Mai'),
  ('e1000000-0000-0000-0000-000000000018', 'd1000000-0000-0000-0000-000000000018', 'b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 15000000, 3, 450000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000019', 'd1000000-0000-0000-0000-000000000019', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 20000000, 3, 600000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000020', 'd1000000-0000-0000-0000-000000000020', 'b8ed9895-3e3b-43df-ae96-15ed9d830478', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 25000000, 3, 750000, 'Paid', now(), 'Nguyễn Thị Lan'),
  ('e1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000021', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 2000000, 5, 100000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000023', 'd1000000-0000-0000-0000-000000000023', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 8500000, 5, 425000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000024', 'd1000000-0000-0000-0000-000000000024', 'b1000000-0000-0000-0000-000000000006', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 12000000, 3, 360000, 'Paid', now(), 'Phạm Văn Hùng'),
  ('e1000000-0000-0000-0000-000000000025', 'd1000000-0000-0000-0000-000000000025', 'a29df4e1-a58b-470f-a010-4655036d25e8', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 18000000, 3, 540000, 'Pending', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000027', 'd1000000-0000-0000-0000-000000000027', 'b1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000002', 'Phạm Văn Hùng', 20000000, 3, 600000, 'Approved', NULL, NULL),
  ('e1000000-0000-0000-0000-000000000028', 'd1000000-0000-0000-0000-000000000028', 'b1000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000003', 'Đỗ Thị Mai', 25000000, 3, 750000, 'Paid', now(), 'Đỗ Thị Mai'),
  ('e1000000-0000-0000-0000-000000000029', 'd1000000-0000-0000-0000-000000000029', 'b1000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', 'Nguyễn Thị Lan', 2000000, 5, 100000, 'Pending', NULL, NULL);

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run after the transaction above.
-- ============================================================

SELECT 'staff' AS t, count(*) FROM staff
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'customer_purchases', count(*) FROM customer_purchases
UNION ALL SELECT 'sales_commissions', count(*) FROM sales_commissions
UNION ALL SELECT 'sales_commissions_by_status_pending', count(*) FROM sales_commissions WHERE status = 'Pending'
UNION ALL SELECT 'sales_commissions_by_status_approved', count(*) FROM sales_commissions WHERE status = 'Approved'
UNION ALL SELECT 'sales_commissions_by_status_paid', count(*) FROM sales_commissions WHERE status = 'Paid'
UNION ALL SELECT 'purchases_historical_import', count(*) FROM customer_purchases WHERE note = 'Historical Import'
UNION ALL SELECT 'purchases_live_sale', count(*) FROM customer_purchases WHERE note = 'Live Sale';
