/** Phase 1.6 - the "Sản phẩm" cell of the Orders list. Display only: never
 * touches totals, payments, status or any business rule.
 *   1 product  -> "Tên sản phẩm"
 *   N products -> "Tên A + (N-1) sản phẩm"
 * `itemCount` (the order_items aggregate the list already loads) is the source
 * of truth for N; `names` supplies the first product's name. */
export function formatOrderProducts(names: readonly (string | null | undefined)[] | undefined, itemCount: number): string {
  if (itemCount <= 0) return "—";
  const first = (names ?? []).find((n): n is string => !!n && n.trim() !== "");
  if (!first) return `${itemCount} sản phẩm`;
  return itemCount === 1 ? first : `${first} + ${itemCount - 1} sản phẩm`;
}
