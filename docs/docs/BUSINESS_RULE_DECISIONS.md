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
