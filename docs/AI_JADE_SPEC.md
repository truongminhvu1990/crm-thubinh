# Jade Intelligence Module — Business Design Spec

**Sprint:** 4
**Module:** Jade Intelligence (advisory recommendation module). "AI Jade" was the working name used during initial drafting — **Jade Intelligence is the official module name** (Product Owner Review, Revision 2), matching `docs/PROJECT_MANIFEST.md`'s existing Module Status entry.
**Status:** Draft — Revision 2, Product Owner Review (PARTIAL PASS) applied — awaiting further Product Owner review.
**Phase:** Business design only. No code, no SQL, no migrations, no UI were written for this document.

**Revision 2 changelog (this pass, Product Owner Review — PARTIAL PASS, 5 scoped decisions):**
1. **Official module name locked to "Jade Intelligence."** "AI Jade" is retired as anything but a working-name footnote. Every section below updated accordingly.
2. **Confirmed: reuse `getMatchingProducts()` as-is.** Do not redesign it, do not replace it. §2 may extend it (add new rule inputs) but must not alter or remove its existing behavior.
3. **Recommendation Rules narrowed to an explicit MVP set (§2):** Customer Preference (Type/Color/Size/Budget), Purchase History (recommend similar products), Inventory (Active + In Stock only). **Removed:** Origin Matching, Aging-Stock Priority, Salesperson Scoping — all three deleted from this spec, not merely deferred.
4. **Added: Recommendation Score, 0–100, rule-based only** (§2.4) — a deterministic score, not a trained/weighted model.
5. **Out of Scope (§4) expanded** to explicitly exclude Chatbot, Vision AI, OCR, Image Recognition, Voice, Camera, Auto Reply.

Everything else from Revision 1 not touched by the five items above remains intact (overall structure, Data Sources, the manifest-naming discovery framing). Nothing in this revision has been implemented — still business design only.

**Roadmap note (residual, low-priority):** Naming is now resolved (item 1 above matches `PROJECT_MANIFEST.md`'s Module Status entry), but the Sprint *number* mismatch from Revision 1 is untouched: the manifest's Sprint Roadmap still lists Sprint 5 = Jade Intelligence, Sprint 4 = Dashboard, while this task runs it as Sprint 4. Not re-raised as a blocking question since the Product Owner reviewed this document under the "Jade Intelligence" name without correcting the sprint number — treated as accepted, not reopened.

---

## 1. Business Design

### 1.1 Purpose

Help sales staff recommend suitable jade products to a customer, using data that already exists in the CRM. This is a **read-only advisory module**: it never writes anything, never talks to a customer directly, and never takes an action on its own — it only surfaces a ranked list of products for a staff member to consider and act on manually, the same way a staff member today would flip between a customer's notes and the product list by hand.

### 1.2 Key discovery — this already exists, undocumented

The exact shape of this module is **already live in the codebase**, not a green-field feature:

- `getMatchingProducts()` in `lib/product.service.ts` — rule-based matching of a `Customer`'s wishlist fields against `Active` products.
- Rendered today as the **"Sản phẩm phù hợp"** ("Suitable Products") card on the Customer Detail page, via `components/customer/CustomerMatchingProducts.tsx`.

Current rule set (already implemented, already in production code):
- Matches `customer.favorite_type` → `product.category`
- Matches `customer.favorite_color` → `product.color`
- Matches `customer.wrist_size` → `product.wrist_size` (exact string match)
- Matches `customer.ring_size` → `product.ring_size` (exact string match)
- Matches `customer.budget` (free-text, parsed to a VND range, e.g. "10-20 triệu") → `product.sale_price` falling inside that range
- Only considers products with `status = 'Active'`
- Returns `[]` if the customer has no wishlist data at all — "nothing honest to match against," per the existing code's own comment, rather than showing arbitrary products
- Ranks by **count of matched fields** (more matches = higher), capped at 6 results
- Every result is labeled with *why* it matched (`matchedOn`: category/color/wrist_size/ring_size/budget badges)

This is exactly "rule-based, no AI, no ML, no LLM, no price prediction" — it already satisfies every constraint in this task's brief. **Confirmed (Product Owner Review, Revision 2): Jade Intelligence reuses this existing engine as-is — do not redesign, do not replace, extend only where §2 explicitly adds a new input.**

### 1.3 What's new that the existing feature doesn't do

The task names four data sources: Customers, Products, Customer Purchases, Inventory. The existing `getMatchingProducts()` only reads **Customers + Products** — it never reads **Customer Purchases** (`customer_purchases` table) or **Inventory** (stock/batch signals) at all. §2 defines the MVP rules that bring those two additional sources in (Purchase History, Inventory gate) — approved in scope per Product Owner Review, Revision 2, but still unimplemented pending Database/UI Design and Development sign-off.

### 1.4 Connection to other modules

| Module | Relationship to Jade Intelligence |
|---|---|
| **Customer** (LOCKED) | Reads existing wishlist fields only (§3). No Customer field, form, or write path changes. |
| **Product** (LOCKED) | Reads existing product fields only (§3), and reuses the existing `getMatchingProducts()` function as its confirmed baseline (§1.2). No Product field, form, or write path changes. |
| **Inventory** (Phase 1 LOCKED) | Jade Intelligence's stock signal must follow the same rule Inventory Phase 1 already locked: `products.status` only — **never** `products.available`/`reserved`/`sold` (see [[inventory-spec-notes]] / `docs/INVENTORY_SPEC.md` §1). Not re-litigated here, just re-applied. |
| **Orders** (BLOCKED) | No dependency. Jade Intelligence does not read from, write to, or wait on Orders in any way. |
| **Reports / Dashboard** | Not addressed by this spec. Any future feed from Jade Intelligence into Reports/Dashboard is out of scope here. |

---

## 2. Recommendation Rules

**MVP scope only** (Product Owner Review, Revision 2). All rules are **deterministic, rule-based field comparisons** — a match either happens or it doesn't, per an explicit `if` condition. The Recommendation Score (§2.4) is an additive tally of these matches, not a trained or weighted model.

### 2.1 A. Customer Preference (existing — reused, not redesigned)

Confirmed reuse of `getMatchingProducts()`'s existing logic, unchanged:
- **Type:** `customer.favorite_type` ↔ `product.category`
- **Color:** `customer.favorite_color` ↔ `product.color`
- **Size:** `customer.wrist_size` ↔ `product.wrist_size`, and `customer.ring_size` ↔ `product.ring_size` — both existing exact-match comparisons, kept exactly as they already work, grouped under the label "Size" per the Product Owner's naming, not merged into one field.
- **Budget:** `customer.budget` (free-text, parsed to a VND range) ↔ `product.sale_price` falling inside that range

This is §1.2's baseline verbatim — no change to the comparison logic itself.

### 2.2 B. Purchase History — recommend similar products (new, MVP)

New rule that **extends** the existing engine (per Revision 2 item 2 — extend, don't redesign/replace): recommend products **similar** to what a customer has already bought, sourced from `customer_purchases` → joined `product`. "Similar" reuses the exact same comparison already proven in §2.1 — same `category` and/or same `color` as a previously purchased product — just sourced from purchase history instead of the manually-entered wishlist. A customer who bought a green jade bangle is shown other green bangles currently eligible (§2.3).

- Works independently of whether the customer has wishlist data — a Purchase History match and a Customer Preference match can both contribute to the same product's score (§2.4).
- Looks only at **that one customer's own** purchase history — never compares across customers ("customers like you" logic is not this rule and remains excluded, §4).

### 2.3 C. Inventory — Active + In Stock only

Only recommend products where:
- `status = 'Active'`, **and**
- the product is in stock.

Per Inventory Phase 1 (LOCKED `docs/INVENTORY_SPEC.md`), `available`/`reserved`/`sold` remain banned project-wide — `status` is the sole approved stock signal. There is no separate, approved "in stock" flag in the schema today, so **this spec treats "Active" and "In Stock" as the same single condition** (`product.status = 'Active'`) rather than two independent ones — flagged in §5 for confirmation rather than silently assumed.

This is a **gate**, not a scored input: a product must pass it to be considered at all (same as the existing engine already enforces). It contributes no points to the Recommendation Score (§2.4).

**Removed per Product Owner Review, Revision 2 — deleted, not deferred:** Origin Matching, Aging-Stock Priority, Salesperson Scoping. None appear anywhere in MVP scope; any future reintroduction would need its own new revision.

### 2.4 Recommendation Score (0–100, rule-based only)

Added per Product Owner Review, Revision 2. A deterministic score expressing how well a product matches a customer — every point comes from an explicit rule hit above, never a trained weight or probability.

**Proposed default weighting** (equal-weighted — no specific weighting was given, so this is a judgment call flagged in §5, not an assumption to build against yet): five possible signals, 20 points each, counted only for products that already passed the §2.3 gate:
- Type match — 20
- Color match — 20
- Size match (wrist or ring, whichever applies) — 20
- Budget match — 20
- Purchase History similarity (§2.2) — 20

`Recommendation Score = (number of matched signals) × 20`, range 0–100. This is the same match-count the existing engine already ranks by (§1.2) — the score just rescales that same count onto a 0–100 axis, introducing no new computation model.

---

## 3. Data Sources

Everything below already exists. No new table, column, or field is proposed anywhere in this spec.

**Customers** (`types/customer.ts`, read via existing `getCustomerById`/`getCustomers`): `favorite_type`, `favorite_color`, `wrist_size`, `ring_size`, `budget` — the five fields §2.1's Customer Preference rules read. (`preferred_origin`, `purpose`, `assigned_salesperson` also exist on this type but are not read by any MVP rule — Origin/Salesperson matching were explicitly removed, Revision 2.)

**Products** (`types/product.ts`, read via existing `getProducts`/`getMatchingProducts`): `category`, `color`, `wrist_size`, `ring_size`, `sale_price`, `status`. Per §2.3, `available`/`reserved`/`sold` remain excluded — same ban already locked for Inventory Phase 1. (`origin`, `salesperson` also exist but are not read by any MVP rule, Revision 2.)

**Customer Purchases** (`customer_purchases` table, `types/purchase.ts`, read via existing `getPurchasesByCustomer`): `customer_id`, `product_id` → joined `product.category`/`product.color`, `sale_date`. Used for §2.2's Purchase History similarity rule.

**Inventory** (Inventory Phase 1, LOCKED `docs/INVENTORY_SPEC.md`): `product.status` as the sole stock signal (§2.3's Active/In-Stock gate). No batch-level data (`batchReport.service.ts`) is read by MVP scope — the aging-stock use of it was removed, Revision 2.

**Not a data source:** no external API, no gemstone certification data beyond the existing `certificate_no` free-text field (never interpreted/validated — see §4), no pricing history beyond `product.sale_price`/`cost_price` as they already sit on the row.

---

## 4. Out of Scope

Per the task's explicit constraints:
- **No AI models.** No training, no model files, no inference pipeline.
- **No machine learning**, including similarity/clustering/collaborative-filtering *across customers* (§2.2 explicitly scopes Purchase History to one customer's own history, never cross-customer) — excluded even though not a "model" in the trained-weights sense.
- **No LLM prompts.** No calls to any language model, local or hosted.
- **No price prediction.** `product.sale_price`/`cost_price` are only ever read as they already exist — never estimated, adjusted, or forecast.
- **No gemstone authenticity identification.** `certificate_no` is read/displayed as an opaque field only, never interpreted, verified, or scored.
- **No redesign of existing business rules.** The existing `getMatchingProducts()` rule set (§1.2/§2.1) stands as-is; §2's new rules only extend it.

**Added per Product Owner Review, Revision 2 — explicitly excluded, no exceptions:**
- **Chatbot** — no conversational interface of any kind.
- **Vision AI** — no image analysis of product/customer photos.
- **OCR** — no text extraction from certificates, documents, or images.
- **Image Recognition** — no automated jade/gemstone visual classification.
- **Voice** — no voice input or output.
- **Camera** — no camera access or capture of any kind.
- **Auto Reply** — no automatic response generation to customers or staff.

Additional exclusions specific to this module, consistent with the above:
- **No write path anywhere.** Jade Intelligence never creates, updates, or deletes a Customer, Product, Purchase, or Inventory record. It never reserves, holds, or flags stock. It is display/advisory only.
- **No customer-facing output.** No message, email, or notification is sent to a customer. Output is for staff eyes only, inside the CRM.
- **No Orders dependency.** Orders is BLOCKED (Project Rules V1.1) — Jade Intelligence does not read from, write to, or wait on it.
- **No new fields, tables, or master data categories.** Every field named in §3 already exists.
- **No automation/action-taking.** Jade Intelligence does not create tasks, reminders, or follow-ups on its own — it only recommends; a human decides and acts.

---

## 5. Open Questions

*Resolved this pass (Revision 2) — no longer open: module name, baseline reuse (confirmed, not redesigned), Origin/Aging-Stock/Salesperson rules (removed, not adopted).*

1. **Purchase History "similar" definition (§2.2):** this spec defines "similar" as same-category and/or same-color as a past purchase, reusing the existing comparison logic exactly. Confirm that's the intended meaning of "recommend similar products," or is a closer/different notion of similarity intended?
2. **Recommendation Score weighting (§2.4):** an equal 20-points-per-signal default is proposed since no specific weighting was given. Confirm equal weighting, or should some signals (e.g., Budget) count for more than others?
3. **"Active" = "In Stock" (§2.3):** the schema has no separate "in stock" flag beyond `status` today, so this spec treats "Active" and "In Stock" as one identical condition. Confirm that reading, or is a distinct "in stock" concept intended (which would need its own field approval)?
4. **Surface area:** does Jade Intelligence stay on the Customer Detail page only (today's placement, via the existing "Sản phẩm phù hợp" card), or does this spec need to cover new surfaces — a standalone page, a Product Detail "customers who might want this" view, or a Dashboard entry point?
5. **Deterministic tie-break:** when two products tie on Recommendation Score, what decides final display order — newest stock first, lowest price first, or the current implicit database order?

---

Business Design only. No code written. No database changes. No UI changes. Stopping — waiting for Product Owner Review.
