export interface CustomerPurchase {
  id?: string;
  customer_id: string;
  product_id?: string | null;
  sale_price: number;
  sale_date: string;
  note?: string;
  created_at?: string;
  /** Snapshotted from the product at sale time - see lib/purchase.service.ts. */
  source?: string | null;
  /** Snapshotted from the product at sale time - see lib/purchase.service.ts. */
  salesperson?: string | null;
  /** Joined via product_id - only present when fetched with the product embed. */
  product?: { id: string; product_name: string; product_code: string } | null;
  /** Joined via customer_id - only present when fetched with the customer embed. */
  customer?: { id: string; full_name: string; customer_code: string } | null;
}

export interface CustomerPurchaseSummary {
  count: number;
  totalRevenue: number;
  lastPurchaseDate: string | null;
}
