export interface Product {
  id?: string;

  // Basic
  sku?: string;
  product_code: string;
  category?: string;
  product_name: string;
  status?: string;

  // Product Information
  color?: string;
  /** Numeric only (e.g. 54, 17.5) - never "Ni 54"/"Ring 17". Label ("Ni tay"/"Ni nhẫn"/"Kích thước") is derived from category in the UI. */
  size?: number;
  weight?: number;
  jade_grade?: string;
  notes?: string;

  /** No longer editable from the Product form (removed in Settings V1.1) - columns are kept so existing data isn't lost. */
  origin?: string;
  jade_type?: string;
  transparency?: string;
  texture?: string;
  shape?: string;
  wrist_size?: string;
  ring_size?: string;

  // Business
  cost_price?: number;
  sale_price?: number;
  discount?: number;
  location?: string;
  certificate_no?: string;
  supplier?: string;
  source?: string;
  salesperson?: string;
  /** See Product Batches module. */
  batch_id?: string | null;
  /** Populated by a join when the product was fetched with its batch - never write this back. */
  batch?: { batch_code: string } | null;

  // Media
  /** No longer editable from the Product form (see Product Images V1) - column kept so existing data isn't lost, backfilled into product_images. */
  image_url?: string;
  /** No longer editable from the Product form - same as image_url. */
  gallery?: string;
  video?: string;
  /** Populated by a join when fetched with images (list/matching queries) - use for the thumbnail (lowest sort_order). Full CRUD goes through productImage.service.ts, not this. */
  images?: { id: string; image_url: string; sort_order: number }[];

  // Inventory
  available?: number;
  reserved?: number;
  sold?: number;

  created_at?: string;
  updated_at?: string;
}
