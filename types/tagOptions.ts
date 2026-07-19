export type TagCategory = "favorite_color" | "jade_type" | "purchase_purpose" | "product_jade_grade";

export interface TagOption {
  id: string;
  category: TagCategory;
  value: string;
  created_at?: string;
}
