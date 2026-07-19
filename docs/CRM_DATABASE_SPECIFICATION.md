# CRM Database Specification

**Status:** Source of Truth for the CRM database schema — permanent reference document.

**Scope:** documents exactly the tables approved so far under **CRM Baseline V1**: `customers`, `products` (Package 1), `master_data`, `tag_options` (Package 2), `customer_purchases` (Package 3), `product_batches`, `product_images` (Package 4), and `orders`, `order_items`, `payments`, `order_events` (Orders Foundation). No other table is documented here.

**Sources used to build this document (schema-only, no application code):**
- `docs/CRM_BASELINE_V1.md` (Baseline V1 implementation plan, approved)
- `supabase/migrations/20260716_crm_baseline_customers_products.sql` (Package 1, approved)
- `supabase/migrations/20260716_crm_baseline_master_data_tag_options.sql` (Package 2, approved)
- `supabase/migrations/20260716_crm_baseline_customer_purchases.sql` (Package 3, approved)
- `supabase/migrations/20260716_crm_baseline_product_batches_product_images.sql` (Package 4, approved)
- `supabase/migrations/20260716_orders_database_foundation.sql` (Orders Foundation, approved)
- `docs/ORDERS_DATABASE.md` (Orders Database Design — Fields, Primary Keys, Foreign Keys, Business Constraints, Business Index Strategy — the design basis for the migration above)
- The Product Owner approved migration history that preceded and informed the files above (`20260709_customer_module_fields.sql`, `20260709_jade_specialization_fields.sql`, `20260709_vip_care_center_fields.sql`, `20260711_customer_country.sql`, `20260715_customer_market.sql`, `20260709_product_module.sql`, `20260711_product_status_fix.sql`, `20260713_product_settings_v1_1.sql`, `20260709_customer_purchases.sql`, `20260709_source_salesperson_fields.sql`, `20260709_master_data.sql`, `20260710_tag_options.sql`, `20260715_master_data_country_category_fix.sql`, `20260710_product_batches.sql`, `20260714_product_images_v1.sql`)

No application code (React, TypeScript, service layer, UI) was used as a source for this document — only approved migrations and the approved CRM Baseline V1 plan.

---

## 1. `customers`

**Purpose:** Stores one row per customer record tracked by the CRM — contact/identity fields, jade product preferences, and sales-tracking fields, as established by the Product Owner approved migration history consolidated into Package 1.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `customer_code` | `text` | NOT NULL | — |
| `full_name` | `text` | NOT NULL | — |
| `phone` | `text` | NOT NULL | — |
| `facebook` | `text` | NULL | — |
| `zalo` | `text` | NULL | — |
| `birthday` | `date` | NULL | — |
| `address` | `text` | NULL | — |
| `vip_level` | `text` | NULL | — |
| `source` | `text` | NULL | — |
| `notes` | `text` | NULL | — |
| `last_contacted` | `timestamptz` | NULL | — |
| `total_purchase` | `numeric` | NULL | — |
| `gender` | `text` | NULL | — |
| `occupation` | `text` | NULL | — |
| `country` | `text` | NULL | — |
| `province` | `text` | NULL | — |
| `district` | `text` | NULL | — |
| `wrist_size` | `text` | NULL | — |
| `ring_size` | `text` | NULL | — |
| `favorite_type` | `text` | NULL | — |
| `favorite_color` | `text` | NULL | — |
| `preferred_origin` | `text` | NULL | — |
| `budget` | `text` | NULL | — |
| `purpose` | `text` | NULL | — |
| `assigned_salesperson` | `text` | NULL | — |
| `last_viewed_product` | `text` | NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- None.

### Constraints
- `customer_code` — `UNIQUE`
- `phone` — `UNIQUE`

### Indexes
- `idx_customers_phone` on (`phone`)
- `idx_customers_customer_code` on (`customer_code`)

*(In addition to the implicit indexes backing the primary key and the two `UNIQUE` constraints above.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.

### Trigger
- `customers_set_updated_at` — `BEFORE UPDATE`, `FOR EACH ROW`, executes `set_customers_updated_at()`, which sets `updated_at = now()` on every row update.

---

## 2. `products`

**Purpose:** Stores one row per product (jade item) tracked by the CRM — identity/catalog fields, product attributes, pricing/business fields, media references, and on-hand inventory counters, as established by the Product Owner approved migration history consolidated into Package 1.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `sku` | `text` | NULL | — |
| `product_code` | `text` | NOT NULL | — |
| `category` | `text` | NULL | — |
| `product_name` | `text` | NOT NULL | — |
| `status` | `text` | NOT NULL | `'Active'` |
| `color` | `text` | NULL | — |
| `size` | `numeric` | NULL | — |
| `weight` | `numeric` | NULL | — |
| `jade_grade` | `text` | NULL | — |
| `notes` | `text` | NULL | — |
| `origin` | `text` | NULL | — |
| `jade_type` | `text` | NULL | — |
| `transparency` | `text` | NULL | — |
| `texture` | `text` | NULL | — |
| `shape` | `text` | NULL | — |
| `wrist_size` | `text` | NULL | — |
| `ring_size` | `text` | NULL | — |
| `cost_price` | `numeric` | NULL | — |
| `sale_price` | `numeric` | NULL | — |
| `discount` | `numeric` | NULL | — |
| `location` | `text` | NULL | — |
| `certificate_no` | `text` | NULL | — |
| `supplier` | `text` | NULL | — |
| `source` | `text` | NULL | — |
| `salesperson` | `text` | NULL | — |
| `image_url` | `text` | NULL | — |
| `gallery` | `text` | NULL | — |
| `video` | `text` | NULL | — |
| `available` | `integer` | NOT NULL | `0` |
| `reserved` | `integer` | NOT NULL | `0` |
| `sold` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

**Note:** `batch_id` is not part of this table as approved under Package 1. It is documented as a Package 4 (`product_batches`) follow-on column in the approved migration history and is out of scope until Package 4 is approved.

### Primary Key
- `id`

### Foreign Keys
- None.

### Constraints
- `product_code` — `UNIQUE`

### Indexes
- `idx_products_product_code` on (`product_code`)
- `idx_products_sku` on (`sku`)

*(In addition to the implicit indexes backing the primary key and the `UNIQUE` constraint above.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.

### Trigger
- `products_set_updated_at` — `BEFORE UPDATE`, `FOR EACH ROW`, executes `set_customers_updated_at()` (the same shared trigger function used by `customers`), which sets `updated_at = now()` on every row update.

---

## 3. `master_data`

**Purpose:** Single generic lookup table backing the CRM's configurable dropdown categories (Settings > Master Data), as established by the Product Owner approved migration history consolidated into Package 2.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `category` | `text` | NOT NULL | — |
| `value` | `text` | NOT NULL | — |
| `sort_order` | `integer` | NOT NULL | `0` |
| `is_active` | `boolean` | NOT NULL | `true` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

`value` doubles as the stored identifier and the display text — there is no separate label column.

### Primary Key
- `id`

### Foreign Keys
- None.

### Constraints
- `category` — `CHECK (category IN ('salesperson', 'product_source', 'customer_stage', 'product_category', 'product_color', 'market', 'country'))`
- `UNIQUE (category, value)`

### Indexes
- No standalone index beyond the primary key and the `UNIQUE (category, value)` composite index (which serves every documented `category`-filtered access pattern via its leading column).

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.

### Trigger
- None.

---

## 4. `tag_options`

**Purpose:** Freeform, creatable tag values for a small set of categories, as established by the Product Owner approved migration history consolidated into Package 2.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `category` | `text` | NOT NULL | — |
| `value` | `text` | NOT NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- None.

### Constraints
- `category` — `CHECK (category IN ('favorite_color', 'jade_type', 'purchase_purpose', 'product_jade_grade'))`
- `UNIQUE (category, value)`

### Indexes
- No standalone index beyond the primary key and the `UNIQUE (category, value)` composite index (which serves every documented `category`-filtered access pattern via its leading column).

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.

### Trigger
- None.

---

## 5. `product_batches`

**Purpose:** Stores one row per batch of products received together from a supplier, with an optional return-to-supplier deadline, as established by the Product Owner approved migration history consolidated into Package 4.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `batch_code` | `text` | NOT NULL | — |
| `supplier` | `text` | NULL | — |
| `received_date` | `date` | NULL | — |
| `return_due_date` | `date` | NULL | — |
| `other_cost` | `numeric` | NULL | — |
| `notes` | `text` | NULL | — |
| `status` | `text` | NOT NULL | `'active'` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- None outgoing. Referenced by `products.batch_id` (a Package 4 follow-on column on the already-approved `products` table) with `ON DELETE SET NULL`.

### Constraints
- `status` — `CHECK (status IN ('active', 'closed', 'returned'))`

### Indexes
- `product_batches_batch_code_ci_idx` — `UNIQUE`, on (`lower(trim(batch_code))`) — case-insensitive uniqueness on batch code.
- `idx_products_batch_id` — on `products(batch_id)`, the supporting index for the reverse relationship above (physically located on the `products` table).

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.

### Trigger
- `product_batches_set_updated_at` — `BEFORE UPDATE`, `FOR EACH ROW`, executes `set_customers_updated_at()` (the same shared trigger function used by `customers`/`products`), which sets `updated_at = now()` on every row update.

### Notes
- `products.batch_id uuid REFERENCES product_batches(id) ON DELETE SET NULL` was added to the `products` table by the Package 4 migration. Per this task's explicit instruction not to modify the documentation for `products` (Section 2), that section still reads as it did after Package 1 and does not list `batch_id` among its columns. This is a known, deliberate gap in this document pending a future documentation task authorized to update Section 2.

---

## 6. `product_images`

**Purpose:** Stores an ordered list of images per product — the image with the lowest `sort_order` is the thumbnail — as established by the Product Owner approved migration history consolidated into Package 4.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `product_id` | `uuid` | NOT NULL | — |
| `image_url` | `text` | NOT NULL | — |
| `sort_order` | `integer` | NOT NULL | `0` |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- `product_id` → `products(id)`, `ON DELETE CASCADE`

### Constraints
- None beyond the `NOT NULL` column constraints listed above and the foreign key.

### Indexes
- `idx_product_images_product_id` — on (`product_id`)
- `idx_product_images_product_sort` — on (`product_id`, `sort_order`)

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access to anon"` — `FOR ALL`, role `anon`, `USING (true)`, `WITH CHECK (true)`.
- Associated storage policies on `storage.objects`, scoped to the `product-images` bucket (see Notes below): `"Public read product-images"` (`FOR SELECT`, `USING (bucket_id = 'product-images')`), `"Anon upload product-images"` (`FOR INSERT`, role `anon`, `WITH CHECK (bucket_id = 'product-images')`), `"Anon update product-images"` (`FOR UPDATE`, role `anon`, `USING (bucket_id = 'product-images')`), `"Anon delete product-images"` (`FOR DELETE`, role `anon`, `USING (bucket_id = 'product-images')`).

### Trigger
- None.

### Notes
- Associated storage bucket: `product-images` (`public = true`), created by the Package 4 migration via `INSERT INTO storage.buckets`.
- The Package 4 migration also carries a data-preserving backfill (`INSERT INTO product_images ... SELECT ... FROM products` reading each product's own pre-existing `image_url`/`gallery` values) — not seed or mock data, and a no-op at migration-authoring time since `products` held 0 rows.

---

## 7. `orders`

**Purpose:** The header record of one transaction — which customer, who owns the deal, what it totals, what state it's in. Every other Orders table hangs off this one, as established by `docs/ORDERS_DATABASE.md` §3 and consolidated into the Orders Foundation migration.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `order_number` | `text` | NOT NULL | — |
| `customer_id` | `uuid` | NOT NULL | — |
| `sales_owner` | `text` | NOT NULL | — |
| `created_by` | `text` | NOT NULL | — |
| `order_date` | `date` | NOT NULL | `CURRENT_DATE` |
| `lost_reason` | `text` | NULL | — |
| `subtotal` | `numeric` | NOT NULL | `0` |
| `discount_total` | `numeric` | NOT NULL | `0` |
| `total_amount` | `numeric` | NOT NULL | `0` |
| `order_status` | `text` | NOT NULL | `'Draft'` |
| `payment_status` | `text` | NOT NULL | `'Unpaid'` |
| `note` | `text` | NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |
| `updated_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- `customer_id` → `customers(id)`, `ON DELETE RESTRICT`

### Constraints
- `order_number` — `UNIQUE`
- `order_status` — `CHECK (order_status IN ('Draft', 'Reserved', 'Completed', 'Lost'))`
- `payment_status` — `CHECK (payment_status IN ('Unpaid', 'Partially Paid', 'Paid'))`

### Indexes
- `idx_orders_customer_id` on (`customer_id`)
- `idx_orders_status_payment_status` on (`order_status`, `payment_status`)
- `idx_orders_order_date` on (`order_date`)
- `idx_orders_sales_owner` on (`sales_owner`)

*(In addition to the implicit indexes backing the primary key and the `order_number` `UNIQUE` constraint.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access"` — `FOR ALL`, `USING (true)`, `WITH CHECK (true)` (no `TO anon` role restriction — a different policy naming/scoping convention than `customers`/`products`/`master_data`/`tag_options`/`product_batches`/`product_images` use, functionally equivalent since the default policy role is `PUBLIC`, which includes `anon`).

### Trigger
- None. Unlike `customers`/`products`/`product_batches`, no `BEFORE UPDATE` trigger sets `updated_at` automatically on this table.

### Notes
- `sales_owner`, `created_by`, and `lost_reason` are plain `text` values, not foreign keys — validated against the `master_data` table's `category`+`value` pairing at the application layer, matching the existing `products.source`/`salesperson` pattern (per `docs/ORDERS_DATABASE.md` §7).
- The conditional rule "Lost Reason required only when Order Status = Lost" and all order-status-transition rules are **not** enforced at the database level — `docs/ORDERS_DATABASE.md` §8 explicitly names these as needing an application-layer or concurrency-safe mechanism beyond plain DDL.

---

## 8. `order_items`

**Purpose:** One line of one order — which product, at what negotiated price, with what discount, in what quantity, and whether it's a gift and how it's packaged, as established by `docs/ORDERS_DATABASE.md` §3 and consolidated into the Orders Foundation migration.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `order_id` | `uuid` | NOT NULL | — |
| `product_id` | `uuid` | NOT NULL | — |
| `snapshot_sale_price` | `numeric` | NOT NULL | — |
| `discount` | `numeric` | NOT NULL | `0` |
| `quantity` | `integer` | NOT NULL | `1` |
| `line_total` | `numeric` | NOT NULL | `0` |
| `is_gift` | `boolean` | NOT NULL | `false` |
| `gift_recipient_name` | `text` | NULL | — |
| `gift_note` | `text` | NULL | — |
| `packaging_option` | `text` | NULL | — |

### Primary Key
- `id`

### Foreign Keys
- `order_id` → `orders(id)`, `ON DELETE CASCADE`
- `product_id` → `products(id)`, `ON DELETE RESTRICT`

### Constraints
- `quantity` — `CHECK (quantity > 0)`

### Indexes
- `idx_order_items_order_id` on (`order_id`)
- `idx_order_items_product_id` on (`product_id`)

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access"` — `FOR ALL`, `USING (true)`, `WITH CHECK (true)` (no `TO anon` role restriction — see Notes on `orders` above).

### Trigger
- None.

### Notes
- `packaging_option` is a plain `text` value, not a foreign key — validated against `master_data` at the application layer (per `docs/ORDERS_DATABASE.md` §7).
- The "at most one open Order Item per Product" business constraint is **not** enforced at the database level — `docs/ORDERS_DATABASE.md` §8 names this as needing a concurrency-safe mechanism at implementation time, not plain DDL.

---

## 9. `payments`

**Purpose:** One payment event against one order — modeled as its own table rather than a single running-total column on `orders`, so deposits, installments, and post-completion balance settlement never require a schema change, as established by `docs/ORDERS_DATABASE.md` §3 and consolidated into the Orders Foundation migration.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `order_id` | `uuid` | NOT NULL | — |
| `amount` | `numeric` | NOT NULL | — |
| `payment_method` | `text` | NOT NULL | — |
| `payment_date` | `date` | NOT NULL | `CURRENT_DATE` |
| `note` | `text` | NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- `order_id` → `orders(id)`, `ON DELETE CASCADE`

### Constraints
- `amount` — `CHECK (amount > 0)`

### Indexes
- `idx_payments_order_id` on (`order_id`)
- `idx_payments_payment_date` on (`payment_date`)

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access"` — `FOR ALL`, `USING (true)`, `WITH CHECK (true)` (no `TO anon` role restriction — see Notes on `orders` above).

### Trigger
- None.

### Notes
- `payment_method` is a plain `text` value, not a foreign key — validated against `master_data` at the application layer (per `docs/ORDERS_DATABASE.md` §7).

---

## 10. `order_events`

**Purpose:** An append-only history of everything that happened to one order, as established by `docs/ORDERS_DATABASE.md` §3 and consolidated into the Orders Foundation migration.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `order_id` | `uuid` | NOT NULL | — |
| `event_type` | `text` | NOT NULL | — |
| `event_detail` | `text` | NOT NULL | — |
| `actor` | `text` | NOT NULL | — |
| `event_timestamp` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- `order_id` → `orders(id)`, `ON DELETE CASCADE`

### Constraints
- None beyond the `NOT NULL` column constraints listed above and the foreign key.

### Indexes
- `idx_order_events_order_id_timestamp` on (`order_id`, `event_timestamp`)

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access"` — `FOR ALL`, `USING (true)`, `WITH CHECK (true)` (no `TO anon` role restriction — see Notes on `orders` above).

### Trigger
- None.

### Notes
- `actor` is a plain `text` value, not a foreign key — validated against `master_data` at the application layer (per `docs/ORDERS_DATABASE.md` §7).
- The append-only guarantee (rows only ever inserted, never updated or deleted) is **not** enforced at the database level — `docs/ORDERS_DATABASE.md` §13 names this as an application-layer promise only, flagged there as a risk worth a stronger enforcement mechanism if the audit-trust guarantee matters as much as the design implies.

---

## 11. `customer_purchases`

**Purpose:** A flat purchase log per customer, used to compute Purchase Count, Total Revenue, Last Purchase Date, and tier, as established by the Product Owner approved migration history consolidated into Package 3.

### Columns

| Column | Data Type | Null | Default |
|---|---|---|---|
| `id` | `uuid` | NOT NULL | `gen_random_uuid()` |
| `customer_id` | `uuid` | NOT NULL | — |
| `product_id` | `uuid` | NULL | — |
| `sale_price` | `numeric` | NOT NULL | — |
| `sale_date` | `date` | NOT NULL | `CURRENT_DATE` |
| `note` | `text` | NULL | — |
| `source` | `text` | NULL | — |
| `salesperson` | `text` | NULL | — |
| `created_at` | `timestamptz` | NOT NULL | `now()` |

### Primary Key
- `id`

### Foreign Keys
- `customer_id` → `customers(id)`, `ON DELETE CASCADE`
- `product_id` → `products(id)`, `ON DELETE SET NULL`

### Constraints
- None beyond the `NOT NULL` column constraints listed above and the two foreign keys.

### Indexes
- `idx_customer_purchases_customer_id` on (`customer_id`)

*(In addition to the implicit index backing the primary key.)*

### RLS
- Enabled (`ENABLE ROW LEVEL SECURITY`).

### Policies
- `"Allow full access"` — `FOR ALL`, `USING (true)`, `WITH CHECK (true)` (no `TO anon` role restriction — the same naming/scoping convention used by `orders`/`order_items`/`payments`/`order_events`, functionally equivalent to the `TO anon`-scoped policies used elsewhere since the default policy role is `PUBLIC`, which includes `anon`).

### Trigger
- None.

### Notes
- `source` and `salesperson` are a snapshot copied in at the time of sale, distinct from `products.source`/`salesperson` (the current, editable values on the product itself) — so historical aggregates stay accurate even if a product's source/salesperson is edited later, per the approved migration history.
- `product_id` is nullable with `ON DELETE SET NULL`, unlike `customer_id`'s `ON DELETE CASCADE` — a purchase record survives its product being removed but not its customer being removed.

---

## NOT YET APPROVED Tables

The following tables are known to be part of the CRM's eventual database footprint (per `docs/CRM_BASELINE_V1.md`'s Baseline Tables list and the project's migration history) but are **not** covered by this document because they have not been approved under a completed CRM Baseline V1 package. No schema is asserted for any of them here.

This document will be extended with a new numbered section per table only once that table's migration has been reviewed and approved under its own CRM Baseline V1 package, following the same "approved = documented" sequence used for Packages 1 and 2. This document itself is not to be rewritten retroactively — only extended, per the same read-only-once-approved convention already established for other locked project documents.
