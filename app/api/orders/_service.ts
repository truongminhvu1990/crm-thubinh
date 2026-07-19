import { createOrderService } from "@/lib/orders/order.service";
import { supabaseOrderRepository } from "@/lib/orders/order.repository";

/** Shared, module-level Order Write Service instance for the API layer —
 * dependency-injected with the concrete Supabase repository now that every
 * OrderRepository member has an implementation. */
export const orderService = createOrderService(supabaseOrderRepository);
