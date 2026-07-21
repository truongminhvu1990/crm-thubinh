import * as repo from "./voucher.repository";
import { MarketingVoucher, VoucherFilters } from "@/types/marketingAutomation";
import { logActivity } from "@/lib/activityLog.service";

// Business logic / composition only - voucher.repository.ts owns every
// direct Supabase call. Package 3/8.

export async function getVouchersPage(filters: VoucherFilters) {
  return repo.findVouchersPage(filters);
}

export async function getVoucherById(id: string) {
  return repo.findVoucherById(id);
}

export async function getLatestVoucher() {
  return repo.findLatestVoucher();
}

function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export async function createVoucher(input: {
  code?: string | null;
  name: string;
  description?: string | null;
  customerId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdBy: string | null;
}): Promise<MarketingVoucher | null> {
  const voucher = await repo.createVoucher({
    code: input.code?.trim() || generateVoucherCode(),
    name: input.name,
    description: input.description ?? null,
    status: "Draft",
    customer_id: input.customerId ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    expires_at: null,
    created_by: input.createdBy,
  });
  if (voucher?.id) {
    await logActivity({ staff_id: input.createdBy, action: "Voucher Updated", entity: "marketing_voucher", entity_id: voucher.id });
  }
  return voucher;
}

export async function updateVoucher(
  id: string,
  input: { name: string; description?: string | null; customerId?: string | null; startDate?: string | null; endDate?: string | null },
  staffId: string | null
): Promise<MarketingVoucher | null> {
  const voucher = await repo.updateVoucher(id, {
    name: input.name,
    description: input.description ?? null,
    customer_id: input.customerId ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
  });
  if (voucher) {
    await logActivity({ staff_id: staffId, action: "Voucher Updated", entity: "marketing_voucher", entity_id: id });
  }
  return voucher;
}

export async function setVoucherStatus(id: string, status: MarketingVoucher["status"], staffId: string | null): Promise<MarketingVoucher | null> {
  const voucher = await repo.updateVoucher(id, { status });
  if (voucher) {
    await logActivity({ staff_id: staffId, action: "Voucher Updated", entity: "marketing_voucher", entity_id: id });
  }
  return voucher;
}
