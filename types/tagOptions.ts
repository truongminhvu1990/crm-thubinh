export type TagCategory =
  | "favorite_color"
  | "jade_type"
  | "purchase_purpose"
  | "product_jade_grade"
  | "customer_tag";

export interface TagOption {
  id: string;
  category: TagCategory;
  value: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}
