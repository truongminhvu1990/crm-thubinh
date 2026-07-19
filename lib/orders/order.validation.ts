import {
  AddOrderItemInput,
  AddPaymentInput,
  CreateOrderInput,
  MarkOrderLostInput,
  ReassignSalesOwnerInput,
} from "@/types/order";
import { ORDER_NUMBER_PATTERN } from "./order.constants";

// Pure business-rule validation and derivation — no Supabase calls, no I/O.
// Every rule/message traces to ORDERS_SPEC.md §4 or ORDERS_UI.md §17.

export function validateCreateOrderInput(input: Pick<CreateOrderInput, "customer_id">): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.customer_id) {
    errors.customer_id = "Vui lòng chọn khách hàng";
  }
  return errors;
}

export function validateAddOrderItemInput(input: AddOrderItemInput): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!input.product_id) {
    errors.product_id = "Vui lòng chọn sản phẩm";
  }
  if (input.snapshot_sale_price === undefined || input.snapshot_sale_price <= 0) {
    errors.snapshot_sale_price = "Vui lòng nhập giá bán";
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    errors.quantity = "Số lượng phải lớn hơn 0";
  }
  if (input.discount < 0) {
    errors.discount = "Chiết khấu không hợp lệ";
  }

  return errors;
}

export function validatePaymentAmount(input: Pick<AddPaymentInput, "amount">): string | null {
  return input.amount > 0 ? null : "Số tiền thanh toán phải lớn hơn 0";
}

/** Non-blocking, per ORDERS_SPEC.md §4: overpayment is allowed, UI warns but never blocks submit. */
export function getOverpaymentWarning(amount: number, alreadyPaid: number, totalAmount: number): string | null {
  const remaining = totalAmount - alreadyPaid;
  return amount > remaining ? "Số tiền vượt quá số dư còn lại" : null;
}

export function validateMarkOrderLostInput(input: Pick<MarkOrderLostInput, "lost_reason">): string | null {
  return input.lost_reason ? null : "Vui lòng chọn lý do";
}

export function validateReassignSalesOwnerInput(input: Pick<ReassignSalesOwnerInput, "sales_owner">): string | null {
  return input.sales_owner ? null : "Vui lòng chọn nhân viên phụ trách";
}

export function isValidOrderNumberFormat(orderNumber: string): boolean {
  return ORDER_NUMBER_PATTERN.test(orderNumber);
}
