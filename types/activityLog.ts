export interface ActivityLog {
  id: string;
  staff_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  created_at: string;
  /** Resolved at read time for display only - never written back. */
  staff?: { full_name: string; staff_code: string } | null;
}
