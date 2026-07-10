import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { syncWholesaleOrderFromItems } from "@/lib/admin/wholesale-order-sync";
import {
  isSupplierDeliveryComplete,
  isPaymentSettledForCustomer,
  isPaymentSettledForWholesale,
} from "@/lib/suppliers/delivery-status";
import {
  tryCreditReferralForCustomerOrder,
  tryCreditReferralForWholesaleItem,
} from "@/lib/referrals/vendor-referral";
import { notifyWholesaleItemDelivered } from "@/lib/notifications/wholesale-sms";

export { isWorkQueueOrderStatus, isEffectivelyFulfilled } from "@/lib/admin/order-board-status";

/**
 * Close the gap when payment is settled and the supplier API already delivered,
 * but the line status was never moved off queued/processing (e.g. webhook mismatch).
 */
export async function reconcileAutoFulfilledOrders(
  service: SupabaseClient,
): Promise<{ wholesaleItems: number; customerOrders: number }> {
  const now = new Date().toISOString();
  let wholesaleItems = 0;
  let customerOrders = 0;
  const parentIds = new Set<string>();

  const { data: staleItems } = await service
    .from("wholesale_order_items")
    .select(
      `
      id, status, supplier_status, wholesale_order_id,
      wholesale_orders!inner ( status, payment_reference )
    `,
    )
    .in("status", ["queued", "processing", "pending"]);

  for (const raw of staleItems ?? []) {
    const item = raw as {
      id: string;
      supplier_status: string | null;
      wholesale_order_id: string;
      wholesale_orders:
        | { status: string; payment_reference: string | null }
        | { status: string; payment_reference: string | null }[];
    };
    const order = Array.isArray(item.wholesale_orders)
      ? item.wholesale_orders[0]
      : item.wholesale_orders;
    if (!order) continue;
    if (!isPaymentSettledForWholesale(order.status, order.payment_reference)) continue;
    if (!isSupplierDeliveryComplete(item.supplier_status)) continue;

    const { error } = await service
      .from("wholesale_order_items")
      .update({
        status: "fulfilled",
        supplier_fulfilled_at: now,
      })
      .eq("id", item.id);
    if (error) continue;

    wholesaleItems += 1;
    parentIds.add(item.wholesale_order_id);
    after(() => tryCreditReferralForWholesaleItem(item.id));
    after(() => notifyWholesaleItemDelivered(item.id));
  }

  for (const parentId of parentIds) {
    await syncWholesaleOrderFromItems(service, parentId);
  }

  const { data: staleOrders } = await service
    .from("orders")
    .select("id, status, supplier_status")
    .in("status", ["paid", "queued", "processing"]);

  for (const raw of staleOrders ?? []) {
    const row = raw as { id: string; status: string; supplier_status: string | null };
    if (!isPaymentSettledForCustomer(row.status)) continue;
    if (!isSupplierDeliveryComplete(row.supplier_status)) continue;

    const { error } = await service
      .from("orders")
      .update({
        status: "fulfilled",
        fulfilled_at: now,
      })
      .eq("id", row.id);
    if (error) continue;

    customerOrders += 1;
    after(() => tryCreditReferralForCustomerOrder(row.id));
  }

  return { wholesaleItems, customerOrders };
}
