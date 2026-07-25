export type MasterDataCategory =
  | "salesperson"
  | "product_source"
  | "customer_stage"
  | "product_category"
  | "product_color"
  | "market"
  | "country"
  | "payment_method"
  | "customer_source"
  | "shipping_provider"
  | "bank"
  | "follow_up_status";

export interface MasterDataItem {
  id: string;
  category: MasterDataCategory;
  value: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}
