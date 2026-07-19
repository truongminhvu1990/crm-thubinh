export type MasterDataCategory =
  | "salesperson"
  | "product_source"
  | "customer_stage"
  | "product_category"
  | "product_color"
  | "market"
  | "country";

export interface MasterDataItem {
  id: string;
  category: MasterDataCategory;
  value: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}
