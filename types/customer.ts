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
  /** Staff Management (Sprint v2.0.0), Feature 4 - the structured "one
   * primary staff" assignment. `assigned_salesperson` (free text) is kept
   * untouched alongside this for backward compatibility. */
  assigned_staff_id?: string | null;
  last_viewed_product?: string;

  // VIP Care
  /** Comma-separated tags (VIP, Potential, Wholesale, Retail, Important, Follow Up, custom...). Use parseMultiValue/serializeMultiValue. */
  customer_tags?: string | null;
  /** Single-select VIP Care pipeline status. See CUSTOMER_STATUS_OPTIONS in lib/customer.constants.ts. */
  customer_status?: string | null;
  /** Scheduled next follow-up date. */
  next_followup_date?: string | null;
  /** Note attached to the scheduled follow-up. */
  followup_note?: string | null;
}

export interface CustomerNote {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  /** Timeline event kind. Absent/"note" = a manually written note (legacy behavior). */
  type?: "note" | "status_changed" | "tag_added" | "tag_removed" | "followup_updated";
}
