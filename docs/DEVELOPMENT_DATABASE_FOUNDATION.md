# Development Database Foundation — Master Rebuild Checklist

**Sprint:** Development Database Foundation (P0) — blocks Orders and all other modules.
**Status of Development:** confirmed empty via live read-only check (`PGRST205 — relation does not exist`) for `customers`, `master_data`, and every other table, re-verified at the time of writing. Nothing has been executed against it.
**This document:** planning only. No SQL, no code, no UI, no implementation. It consolidates and supersedes-in-scope the three prior planning documents from this sprint (`Migration Inventory`, `Baseline Database Recovery`, and the `master_data` constraint investigation) into one master checklist.

---

## 1. Baseline tables

The CRM requires **11 tables** and **1 storage bucket**. Two tables have no creating migration anywhere in the repository — this is the single biggest open item blocking a from-scratch rebuild.

| Table | Creating migration | Status |
|---|---|---|
| `customers` | **none exists in repo** | ⚠️ Missing baseline — see §7 |
| `products` | **none exists in repo** | ⚠️ Missing baseline — see §7 |
| `master_data` | `20260709_master_data.sql` | Defined |
| `tag_options` | `20260710_tag_options.sql` | Defined |
| `customer_purchases` | `20260709_customer_purchases.sql` | Defined (FK → `customers`, `products`) |
| `product_batches` | `20260710_product_batches.sql` | Defined |
| `product_images` | `20260714_product_images_v1.sql` | Defined (FK → `products`) |
| `orders` | `20260712_orders_reset.sql` | Defined (FK → `customers`, `products`) |
| `order_items` | `20260712_orders_reset.sql` | Defined (FK → `orders`, `products`) |
| `payments` | `20260712_orders_reset.sql` | Defined (FK → `orders`) |
| `order_events` | `20260712_orders_reset.sql` | Defined (FK → `orders`) |

Storage: `product-images` bucket, created by `20260714_product_images_v1.sql`. It is the only bucket referenced anywhere in the app.

---

## 2. Migration execution order

| # | Migration | Classification | Notes |
|---|---|---|---|
| 0 | *(missing — customers/products baseline)* | **Blocking, unauthored** | No file in repo can create these; see §7 |
| 1 | `20260709_customer_module_fields.sql` | Required | Alters `customers` |
| 2 | `20260709_product_module.sql` | Required | Alters `products`; adds RLS + policy on `products` |
| 3 | `20260709_jade_specialization_fields.sql` | Required | Alters `customers` |
| 4 | `20260709_vip_care_center_fields.sql` | Required | Alters `customers`; adds 2 columns absent from current `types/customer.ts` (see §6/§7) |
| 5 | `20260709_customer_purchases.sql` | Required | Creates `customer_purchases` |
| 6 | `20260709_source_salesperson_fields.sql` | Required | Alters `products`, `customer_purchases` — must run after #5 |
| 7 | `20260709_master_data.sql` | Required | Creates `master_data` + seed rows |
| 8 | `20260710_tag_options.sql` | Required | Creates `tag_options` |
| 9 | `20260710_product_batches.sql` | Required | Creates `product_batches`; alters `products` |
| 10 | `20260711_customer_country.sql` | Required | Alters `customers`; constraint clause superseded by #13/#16/#17 |
| 11 | `20260711_product_status_fix.sql` | Required | Data/default normalization on `products.status` |
| 12 | `20260712_orders_module.sql` | **Deprecated** | 0-byte file — superseded no-op |
| 13 | `20260713_product_settings_v1_1.sql` | Required | Constraint clause superseded by #16/#17 |
| 14 | `20260712_orders_reset.sql` | Required | Creates `orders`, `order_items`, `payments`, `order_events` |
| 15 | `20260714_product_images_v1.sql` | Required | Creates `product_images` + storage bucket |
| 16 | `20260715_customer_market.sql` | Required | Constraint clause superseded by #17 |
| 17 | `20260715_master_data_country_category_fix.sql` | Required — **drafted, not yet approved for execution** | Corrects `master_data` category constraint to the 7 approved categories |

---

## 3. Dependency graph

```
(missing baseline) ──► customers ─┬─► #1 customer_module_fields
                                   ├─► #3 jade_specialization_fields
                                   ├─► #4 vip_care_center_fields
                                   └─► #10 customer_country ──┐
                                                               │
(missing baseline) ──► products ──┬─► #2 product_module        │
                                   ├─► #11 product_status_fix   │
                                   ├─► #9 product_batches ──► product_batches
                                   └─► #13 product_settings_v1_1
                                                               │
customers + products ─────────────────────────────────────────┴─► #5 customer_purchases ──► #6 source_salesperson_fields

customers + products ──► #14 orders_reset ──► orders ─┬─► order_items
                                                        ├─► payments
                                                        └─► order_events
                          (#12 orders_module = deprecated no-op)

products ──► #15 product_images ──► product_images + storage bucket "product-images"

#7 master_data ──► master_data ─┬─► #10 (constraint clause)
                                 ├─► #13 (constraint clause)
                                 ├─► #16 customer_market (constraint clause)
                                 └─► #17 master_data_country_category_fix (constraint clause, FINAL — pending approval)

#8 tag_options ──► tag_options ──► #13 (constraint clause)
```

---

## 4. Verification checklist

### 4a. Migration dependencies (Req. #4)
- [x] Every `ALTER TABLE`/`CREATE TABLE ... REFERENCES` traced back to its parent table and ordered after it (see §3).
- [ ] **Unresolved:** `customers` and `products` have no parent migration — every dependent migration (#1, #3, #4, #5, #6, #9, #10, #11, #13, #14, #15) is unrunnable until §7 is resolved.

### 4b. Storage buckets (Req. #5)
- [x] `product-images` — created by #15, public read, anon upload/update/delete policies. The only bucket referenced anywhere in the codebase (`lib/productImage.service.ts`). No other bucket is missing.

### 4c. RLS (Req. #6)
| Table | RLS enabled by a migration? |
|---|---|
| `products`, `product_batches`, `product_images`, `customer_purchases`, `master_data`, `tag_options`, `orders`, `order_items`, `payments`, `order_events` | ✅ Yes |
| `customers` | ❌ **No migration anywhere enables RLS on `customers`** |

### 4d. Policies (Req. #7)
- [x] Every table listed above with RLS also has a matching `"Allow full access"` (or `"...to anon"`) policy in the same migration.
- [ ] **`customers` has neither RLS nor a policy** — status entirely undefined in-repo. If a rebuilt baseline enables RLS by default without a policy, the app's anon key will be silently locked out of all customer reads/writes (the same failure class already hit `products` and `customer_purchases` earlier in this project's history).

### 4e. Indexes (Req. #8)
| Table | Indexes defined in a migration? |
|---|---|
| `product_batches` | ✅ unique case-insensitive `batch_code`, `idx_products_batch_id` |
| `product_images` | ✅ `idx_product_images_product_id`, `idx_product_images_product_sort` |
| `customer_purchases` | ✅ `idx_customer_purchases_customer_id` |
| `orders`/`order_items`/`payments`/`order_events` | ✅ 9 named indexes per `ORDERS_DATABASE.md` §9 |
| `customers` | ❌ **None** — no index on `customer_code` or `phone` despite both being used in search filters |
| `products` | ❌ **None** — no index on `product_code` or `sku` despite both being used in search filters |

### 4f. Master data (Req. #9)
- [x] `tag_options` category list (`favorite_color`, `jade_type`, `purchase_purpose`, `product_jade_grade`) matches `types/tagOptions.ts` exactly — no drift.
- [ ] `master_data` category list: the migration chain (#7→#10→#13→#16) drifts from the approved list in `types/masterData.ts` — `country` gets silently dropped at #13 and never restored by #16. Migration #17 (drafted, **not yet approved for execution**) corrects this to the approved 7 categories: `salesperson, product_source, customer_stage, product_category, product_color, market, country`. Until #17 runs, inserting a `country` row would violate the live constraint.
- [ ] No seed data exists yet for the 2 newer categories (`product_category`, `product_color`) or `market`/`country` — by design, per their migration comments ("populated entirely from Settings"), not a defect.

---

## 5. Risks

1. **Highest risk — reconstructing `customers`/`products` from application code is a reconstruction, not a recovery.** No migration in this repo defines these two tables. Application code (`types/customer.ts`, `types/product.ts`, `WRITABLE_FIELDS` in the services) proves which columns are *read or written*, but cannot prove uniqueness constraints, `NOT NULL`, defaults, or precision — none of that is recoverable from usage alone. Since `docs/PROJECT_MANIFEST.md` marks Customer and Product **LOCKED** (implying a working schema exists somewhere real), the safer source of truth is very likely Production's actual schema, not code inference. This needs a Product Owner decision before any baseline DDL is authored.
2. **Every downstream migration is currently unrunnable** until the `customers`/`products` baseline exists — this blocks Orders and every other module, not just Settings/Customer/Product.
3. **`customers` RLS is completely undefined.** Whatever the rebuilt baseline does for RLS on `customers` must include a policy in the same migration, or the anon key will be silently locked out (a failure mode that has already occurred twice in this project for other tables).
4. **The `master_data` category constraint fix (#17) is drafted but unexecuted.** Running the full sequence today would still leave `country` unusable until #17 is explicitly approved and run.
5. **Column-type guesses in a reconstructed baseline could reintroduce known bugs.** Several existing columns (`budget`, `wrist_size`, `favorite_type`, `favorite_color`, `vip_level`, `ring_size`) were explicitly `ALTER COLUMN ... TYPE text`'d in past migrations specifically because their original types were wrong/inconsistent — a guessed baseline risks recreating that exact class of defect.
6. **Two unresolved schema/type drifts found during investigation, not yet resolved by the Product Owner:** `customers.city` is named in a migration comment as pre-existing but appears in no current type or service; `customers.next_reminder_date`/`next_reminder_priority` are added by migration #4 but absent from `types/customer.ts`. Both affect what the "correct" `customers` baseline should contain.
7. **Environment identity ambiguity carried over from prior review:** this repository has exactly one database connection (`.env.local`), used interchangeably as "Development" across this sprint's tasks. No separate Production connection exists in-repo to cross-check against.

---

## 6. Rollback strategy

- **Development currently holds zero data and zero tables**, so "rollback" at this stage has no data-loss dimension — the only thing at risk is wasted execution time from a bad script, not real records.
- The one precedent already in this repo (`20260712_orders_reset.sql`) demonstrates the pattern to reuse for the eventual baseline migration: wrap the whole script in `BEGIN` / `COMMIT`, so a failure partway through leaves the database exactly as it was rather than half-created.
- Every existing migration already uses idempotent guards (`CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`, `ADD COLUMN IF NOT EXISTS`) — safe to re-run from the top if a run is aborted partway. The eventual `customers`/`products` baseline migration should follow the same convention.
- Because Development is disposable pre-launch, the practical rollback lever for any bad rebuild attempt is simply: drop everything and re-run from an empty database again — there is no data to preserve until real data entry begins.
- Once real Development data entry begins (post-baseline), this rollback strategy will need to be revisited — a transaction-wrapped, re-runnable migration is not the same thing as a backup/restore plan for populated tables, and none exists yet.

---

## Open items requiring Product Owner decision before execution

1. How should the `customers`/`products` baseline be authored — reconstructed from this repo's code usage, or introspected (read-only) from a real source of truth (e.g. Production, if one exists outside this repo)?
2. Resolution for `customers.city` and `customers.next_reminder_date`/`next_reminder_priority` (keep, drop, or reconcile with `types/customer.ts`)?
3. Approval to execute migration #17 (`master_data` category constraint fix) once the baseline exists.
4. Whether `customers` should get RLS + a policy as part of the new baseline migration (recommended, to avoid repeating the `products`/`customer_purchases` lockout bug), and what that policy should be.
5. Whether indexes on `customers.customer_code`/`phone` and `products.product_code`/`sku` should be added as part of the baseline (currently absent from every existing migration).

No SQL written. No code changed. No UI touched. Stopping — waiting for Product Owner review.
