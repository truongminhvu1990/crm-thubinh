export interface ProductBatch {
  id?: string;
  batch_code: string;
  supplier?: string;
  received_date?: string;
  return_due_date?: string;
  other_cost?: number;
  status?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}
