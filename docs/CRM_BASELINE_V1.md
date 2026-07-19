# CRM Baseline V1 — Implementation Plan

**Status:** Approved by Product Owner as the successor to `DEVELOPMENT_DATABASE_FOUNDATION.md` (renamed, not re-scoped — the findings, open items, and risks documented there still apply and are carried forward below).
**Nature of this document:** implementation plan only. No SQL, no code, no migration file is created or modified by this document. It becomes the permanent foundation reference for the CRM's database — future modules build on top of it rather than re-deriving it.

---

## 1. Baseline Modules

Modules covered by CRM Baseline V1 (matches `docs/PROJECT_MANIFEST.md`'s LOCKED + IN PROGRESS modules — the ones with an established schema footprint today):

| Module | Manifest status | Included in Baseline V1? |
|---|---|---|
| Customer | LOCKED | Yes |
| Product | LOCKED | Yes |
| Batch | LOCKED | Yes |
| Settings (Master Data / Tag Options) | LOCKED | Yes |
| Orders | IN PROGRESS | Yes — schema is locked (`ORDERS_DATABASE.md`), even though the module itself is still mid-implementation |
| Inventory | PLANNED | No — no schema exists yet |
| Reports | PLANNED | No — reads existing tables only, no schema of its own |
| Jade Intelligence | DESIGN | No |
| Market Intelligence | DESIGN | No |
| Marketing | PLANNED | No |

Baseline V1 is deliberately scoped to *what has already been business-and-database-approved*. Modules still in Design/Planned are explicitly out of scope until they go through the same Business Design → Database Design approval sequence.

---

## 2. Baseline Tables

11 tables + 1 storage bucket, carried forward from the prior foundation review:

| Table | Module | Schema source |
|---|---|---|
| `customers` | Customer | **No creating migration in repo — open item, see §3 Package 0** |
| `products` | Product | **No creating migration in repo — open item, see §3 Package 0** |
| `master_data` | Settings | `20260709_master_data.sql` + correction `20260715_master_data_country_category_fix.sql` |
| `tag_options` | Settings | `20260710_tag_options.sql` |
| `customer_purchases` | Customer | `20260709_customer_purchases.sql` |
| `product_batches` | Batch | `20260710_product_batches.sql` |
| `product_images` | Product | `20260714_product_images_v1.sql` |
| `orders` | Orders | `20260712_orders_reset.sql` |
| `order_items` | Orders | `20260712_orders_reset.sql` |
| `payments` | Orders | `20260712_orders_reset.sql` |
| `order_events` | Orders | `20260712_orders_reset.sql` |
| Storage: `product-images` | Product | `20260714_product_images_v1.sql` |

---

## 3. Migration Packages

The 17 existing migration files plus the one unauthored baseline, grouped into logical, independently-trackable packages. Grouping is for planning/tracking only — it does not merge, rewrite, or reorder any individual file's own internal contents.

| Package | Contents | Status |
|---|---|---|
| **Package 0 — Customer/Product Baseline** | `customers` + `products` `CREATE TABLE` (unauthored) | ⚠️ **Blocked — awaiting Product Owner decision on authoring method (reconstruct from code vs. introspect from a real source of truth); see §6 gate 1** |
| **Package 1 — Customer Core Fields** | `20260709_customer_module_fields.sql`, `20260709_jade_specialization_fields.sql`, `20260709_vip_care_center_fields.sql`, `20260711_customer_country.sql` | Ready to run once Package 0 lands |
| **Package 2 — Product Core Fields** | `20260709_product_module.sql`, `20260711_product_status_fix.sql`, `20260713_product_settings_v1_1.sql` | Ready to run once Package 0 lands |
| **Package 3 — Customer Purchases** | `20260709_customer_purchases.sql`, `20260709_source_salesperson_fields.sql` | Ready to run once Package 0 lands |
| **Package 4 — Master Data & Tag Options** | `20260709_master_data.sql`, `20260710_tag_options.sql`, plus the constraint-drift corrections `20260713` (shared with Package 2), `20260715_customer_market.sql`, `20260715_master_data_country_category_fix.sql` | Table creation ready now (no dependency on Package 0); final constraint state depends on Package 1/2/3 all having landed first, since each contributes a constraint-clause rewrite |
| **Package 5 — Product Batches** | `20260710_product_batches.sql` | Depends on Package 0 (`products`) |
| **Package 6 — Product Images** | `20260714_product_images_v1.sql` (table + storage bucket) | Depends on Package 0 (`products`) |
| **Package 7 — Orders** | `20260712_orders_reset.sql`; `20260712_orders_module.sql` (deprecated, 0-byte, no action needed) | Depends on Package 0 (`customers`, `products`) |

---

## 4. Execution Order

```
Package 0 (Customer/Product Baseline)   ← BLOCKED, must land first
        │
        ├──► Package 1 (Customer Core Fields)
        ├──► Package 2 (Product Core Fields)
        ├──► Package 5 (Product Batches)      [needs products]
        ├──► Package 6 (Product Images)       [needs products]
        └──► Package 3 (Customer Purchases)   [needs customers + products]
                    │
Package 4 (Master Data & Tag Options)          ← can start independently,
        table creation not gated on Package 0,   but constraint state isn't
        but constraint-clause finalization is    "final" until Packages 1/2/3
        gated on Packages 1, 2, 3 landing         have all landed
        │
Package 7 (Orders)                             ← needs Package 0 (customers +
                                                   products); independent of
                                                   Packages 1–6 otherwise
```

Sequential execution order for a single top-to-bottom run: **Package 0 → Package 4 (table creation only) → Package 1 → Package 2 → Package 5 → Package 6 → Package 3 → Package 4 (constraint finalization) → Package 7.** This matches the file-level order already verified in the prior foundation review; packages are a grouping lens on top of that same order, not a replacement for it.

---

## 5. Verification Checklist

Carried forward from the prior foundation review, restated as the standing checklist for Baseline V1 sign-off:

- [ ] All 11 tables exist in Development with columns matching their respective `types/*.ts` definitions.
- [ ] Storage bucket `product-images` exists with public read + anon upload/update/delete policies.
- [ ] RLS is enabled on all 11 tables, **including `customers`** (currently the one table with no RLS state defined anywhere in the repo — must not be left as an oversight in Package 0).
- [ ] A matching "allow access" policy exists everywhere RLS is enabled — no table left RLS-enabled-with-no-policy (the failure mode already hit twice in this project's history for `products` and `customer_purchases`).
- [ ] Indexes exist for every documented access pattern — the 9 named Orders indexes, the `product_batches`/`product_images`/`customer_purchases` indexes already defined, **plus a decision on whether `customers.customer_code`/`phone` and `products.product_code`/`sku` get indexes in Package 0** (currently undefined in any existing migration).
- [ ] `master_data`'s category constraint matches the approved 7-category list (`salesperson, product_source, customer_stage, product_category, product_color, market, country`) after Package 4's constraint-finalization step.
- [ ] `tag_options`'s category list matches `types/tagOptions.ts` (already consistent, no drift found).
- [ ] A live read-only check against every table returns success (no `PGRST205`) rather than the current "table not found" state.

---

## 6. Acceptance Criteria

CRM Baseline V1 is considered **complete and locked** only when all of the following are true:

1. **Package 0 gate:** Product Owner has explicitly decided how `customers`/`products` are authored (reconstruction from code usage vs. introspection from a real source of truth), and the resulting table definitions have been approved before Package 0 executes.
2. **Field-drift gate:** `customers.city` and `customers.next_reminder_date`/`next_reminder_priority` (present in migration history but absent from `types/customer.ts`) have an explicit Product Owner ruling — keep, drop, or reconcile — before Package 0/Package 1 are considered final.
3. **RLS gate:** `customers` ships with RLS + a policy in the same migration that creates it (Package 0) — not deferred to a follow-up fix, per the pattern that already burned this project twice.
4. **Master data gate:** Package 4's constraint-finalization step (`20260715_master_data_country_category_fix.sql` or its Package-0-aware successor) is explicitly approved for execution, not just drafted.
5. **Index gate:** a decision is recorded (approve or explicitly decline) on adding indexes for `customers.customer_code`/`phone` and `products.product_code`/`sku` as part of Package 0.
6. Every item in the §5 Verification Checklist is checked off against the live Development database, not just the migration files.
7. No baseline migration was merged, rewritten, or had its internal SQL altered from what already exists in `supabase/migrations/` — only Package 0 and the constraint-finalization step in Package 4 are genuinely new files.

Until all seven are satisfied, Baseline V1 is **in progress**, not complete — Orders (and any other module) should not be treated as unblocked.

---

## 7. Future Expansion Rules

Governance for any module built on top of this baseline (Inventory, Reports, Jade Intelligence, Market Intelligence, Marketing, and any Baseline V1 revisions), consistent with the already-established Project Rules V1.1:

1. **No retroactive edits to a locked baseline table.** Once a table in §2 is verified per §6, changes to it go through the same Business Design → Database Design → Product Owner approval sequence as any other schema change — never a direct `ALTER` slipped in alongside unrelated work.
2. **New master_data categories require explicit approval before they exist anywhere** — spec, schema constraint, and UI must all be approved together, same as the existing Field Rules in Project Rules V1.1. A new category is added by extending the `CHECK` constraint in a new, separately-dated migration — never by editing an already-approved constraint migration in place.
3. **New tables always ship with RLS + a policy in the same migration that creates them.** This baseline's own `customers` gap (§6 gate 3) is the cautionary example — no future table should repeat it.
4. **Every new table gets its indexes defined at creation time**, based on its actual documented access patterns (mirroring how Orders' 9 indexes were derived from `ORDERS_DATABASE.md` §9) — not added reactively after a performance complaint.
5. **New migrations are always new files, never edits to a file already verified under this baseline** — matches the existing repo convention (e.g. `20260713_product_settings_v1_1.sql` superseding an earlier draft rather than rewriting it) and the Specification Rules' "approved = read-only, further change = new Revision" pattern.
6. **Any change that touches more than one module's tables triggers an Impact Analysis** before implementation, per the existing Project Rules V1.1 Impact Rule — this baseline spans Customer, Product, Batch, Settings, and Orders simultaneously, so it is the most likely place for that rule to apply going forward.
7. **This document is updated only by adding new dated sections, not by rewriting the sections above**, once §6's acceptance criteria are fully satisfied and the baseline is marked locked — the same read-only-once-approved convention already used for `PROJECT_MANIFEST.md` and the Orders spec documents.

---

No SQL written. No code changed. No migration created or modified. Stopping — waiting for Product Owner review.
