-- Minimal UAT Seed — crm-thubinh-dev-v2, per Product Owner "Environment Recovery" decision.
-- Only enough data to execute UAT. No fake/large/demo dataset.
--
-- Judgment call, disclosed: the seed list names "one completed order",
-- "one reserved product", and "one sold product" but only one order is
-- explicitly named. products.status (locked, Inventory Phase 1) has no
-- 'Reserved' value — only Active/Paused/Sold/Discontinued/Returned — so
-- "reserved" cannot be a product-level status. This seed represents it at
-- the Orders level instead (order_status = 'Reserved'), which is the
-- approved design (docs/ORDERS_DATABASE.md), giving 2 orders total:
-- one Completed+Paid (against the Sold product) and one Reserved (against
-- an Active product). Flagged for Product Owner confirmation.

BEGIN;

-- ============================================================
-- 1. MASTER DATA — exactly 3 rows (1 per required category).
-- ============================================================

INSERT INTO master_data (category, value, sort_order, is_active) VALUES
  ('salesperson', 'Nguyễn Văn A', 0, true),
  ('product_source', 'Myanmar', 0, true),
  ('product_category', 'Vòng tay', 0, true);

-- ============================================================
-- 2. CUSTOMERS — 2 rows.
-- ============================================================

INSERT INTO customers (customer_code, full_name, phone, assigned_salesperson)
VALUES
  ('KH0001', 'Trần Thị Hoa', '0901000001', 'Nguyễn Văn A'),
  ('KH0002', 'Lê Văn Minh', '0901000002', 'Nguyễn Văn A');

-- ============================================================
-- 3. PRODUCTS — 3 rows: 1 plain Active, 1 Active (tied to the Reserved
--    order below), 1 Sold (tied to the Completed order below).
-- ============================================================

INSERT INTO products (product_code, category, product_name, status, source, salesperson, sale_price)
VALUES
  ('SP0001', 'Vòng tay', 'Vòng tay ngọc bích A', 'Active', 'Myanmar', 'Nguyễn Văn A', 15000000),
  ('SP0002', 'Vòng tay', 'Vòng tay ngọc bích B', 'Active', 'Myanmar', 'Nguyễn Văn A', 20000000),
  ('SP0003', 'Vòng tay', 'Nhẫn ngọc bích C', 'Sold', 'Myanmar', 'Nguyễn Văn A', 25000000);

-- ============================================================
-- 4. ORDERS — 2 rows (see header note): one Reserved, one Completed+Paid.
-- ============================================================

WITH
  cust1 AS (SELECT id FROM customers WHERE customer_code = 'KH0001'),
  cust2 AS (SELECT id FROM customers WHERE customer_code = 'KH0002'),
  prod2 AS (SELECT id FROM products WHERE product_code = 'SP0002'),
  prod3 AS (SELECT id FROM products WHERE product_code = 'SP0003'),
  order_reserved AS (
    INSERT INTO orders (order_number, customer_id, sales_owner, created_by, subtotal, discount_total, total_amount, order_status, payment_status)
    SELECT 'OD-20260719-000001', cust1.id, 'Nguyễn Văn A', 'Nguyễn Văn A', 20000000, 0, 20000000, 'Reserved', 'Partially Paid'
    FROM cust1
    RETURNING id
  ),
  order_completed AS (
    INSERT INTO orders (order_number, customer_id, sales_owner, created_by, subtotal, discount_total, total_amount, order_status, payment_status)
    SELECT 'OD-20260719-000002', cust2.id, 'Nguyễn Văn A', 'Nguyễn Văn A', 25000000, 0, 25000000, 'Completed', 'Paid'
    FROM cust2
    RETURNING id
  )
INSERT INTO order_items (order_id, product_id, snapshot_sale_price, quantity, line_total)
SELECT order_reserved.id, prod2.id, 20000000, 1, 20000000 FROM order_reserved, prod2
UNION ALL
SELECT order_completed.id, prod3.id, 25000000, 1, 25000000 FROM order_completed, prod3;

INSERT INTO payments (order_id, amount, payment_method)
SELECT o.id, 5000000, 'Chuyển khoản' FROM orders o WHERE o.order_number = 'OD-20260719-000001'
UNION ALL
SELECT o.id, 25000000, 'Chuyển khoản' FROM orders o WHERE o.order_number = 'OD-20260719-000002';

COMMIT;

-- ============================================================
-- VERIFICATION — read-only, run after the transaction above.
-- ============================================================

SELECT 'master_data' AS t, count(*) FROM master_data
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'payments', count(*) FROM payments;
