export interface Customer {
  id?: string;
  customer_code: string;
  full_name: string;
  phone: string;
  facebook?: string;
  zalo?: string;
  birthday?: string;
  address?: string;
  /** Customer stage in the sales pipeline (see Settings > Master Data > Customer Stage). The literal "VIP" also drives the VIP badge. */
  vip_level?: string | null;
  source?: string;
  /** JSON-serialized CustomerNote[]. Use parseCustomerNotes/saveCustomerNotes, don't read/write directly. */
  notes?: string;
  last_contacted?: string;
  total_purchase?: number;
  created_at?: string;
  updated_at?: string;

  // Basic
  gender?: string;
  occupation?: string;
  /** Country (see Settings > Master Data > Quốc gia). */
  country?: string;
  /** Market (see Settings > Master Data > Thị trường). Column kept as `province` for backward compatibility - no longer a Vietnam-only province, can be a country (USA, Canada...) or city. */
  province?: string;
  /** Địa phương - free text (e.g. "California", "Toronto", "Bình Tân"). Column kept as `district` for backward compatibility. */
  district?: string;

  // Jade preferences
  wrist_size?: string;
  /** Preferred ring size (reuses the `ring_size` column, dormant since the original schema). */
  ring_size?: string;
  /** Comma-separated JADE_PRODUCT_TYPES values. Use parseMultiValue/serializeMultiValue. */
  favorite_type?: string;
  /** Comma-separated JADE_COLORS values. Use parseMultiValue/serializeMultiValue. */
  favorite_color?: string;
  preferred_origin?: string;
  budget?: string;
  purpose?: string;

  // Sales
  assigned_salesperson?: string;
  last_viewed_product?: string;
}

export interface CustomerNote {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
}
