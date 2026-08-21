# Business Rule Decisions

## BR-002

Status: LOCKED

Decision ID: BR-002

Title: Legacy customer_purchases Revenue Recognition

Decision:

Historical customer_purchases rows that have

order_item_id IS NULL

represent legacy/manual sales created before the Orders module existed.

Because there is no related Order, BR-001 cannot be evaluated.

Therefore these rows SHALL be treated as revenue recognized.

This exception applies ONLY to historical/manual purchases with order_item_id IS NULL.

All purchases linked to Orders MUST follow BR-001.

Future changes require explicit Product Owner approval.

## BR-003

Status: LOCKED

Decision ID: BR-003

Title: Product Status Standardization — Supplier Return Representation

Decision:

Product Status is standardized to the four-value model:

Available / Reserved / Sold / Archived

The prior status value "Returned" is retired. Where D12 Order
Cancellation's ProductDisposition = "Returned" (UI label "Trả NCC/xưởng")
or the manual returnProductToSupplier() flow previously wrote
products.status = 'Returned', they SHALL instead write
products.status = 'Archived'.

products.returned_at remains the single source of truth for whether an
item was actually returned to supplier. It is unaffected by this
decision and continues to be written exactly as today by both D12's
cancel_order_with_disposition() RPC and returnProductToSupplier().

No business logic may infer the supplier-return fact from the Product
Status string alone. Any reader that needs to know "was this item
returned to supplier" MUST test returned_at IS NOT NULL, never
status = 'Archived' by itself (Archived also covers other, unrelated
non-active dispositions and carries no supplier-return meaning on its
own).

This decision fixes ONLY the "Returned" -> "Archived" mapping. It does
NOT decide the destination for the prior "Paused" or "Discontinued"
values (still unresolved — see the Product Status Standardization
compatibility audit) and does NOT itself implement any code, schema,
data, or migration change.

Explicitly preserved, unchanged by this decision:
- D12 Order Cancellation's per-item disposition mechanism, UI, and
  atomic transaction structure (Decision A, LOCKED, 2026-08-19).
- returnProductToSupplier()'s guard/behavior, other than the single
  destination status literal.
- Every existing returned_at write.
- Compensation Void behavior (no interaction with this decision either
  way).
- No Production or AI-scope impact — this is a Dev-scoped business-rule
  record; no Production data, schema, or deployment is touched.

Implementation (rewriting cancel_order_with_disposition(),
returnProductToSupplier(), computeBatchCounts(), PRODUCT_STATUS
constants, and any backfill of existing 'Returned'/'Active' rows) is
NOT authorized by this decision and requires a separate, explicit
Product Owner implementation authorization.

Future changes require explicit Product Owner approval.
