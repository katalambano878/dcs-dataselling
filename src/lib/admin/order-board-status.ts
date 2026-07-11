import {
  isSupplierDeliveryComplete,
  isSupplierDeliveryFailed,
} from "@/lib/suppliers/delivery-status";

export function isWorkQueueOrderStatus(status: string): boolean {
  return ["queued", "processing", "pending", "paid"].includes(status);
}

export function isEffectivelyFulfilled(row: {
  orderStatus: string;
  paymentStatus: string;
  apiStatus: string | null;
}): boolean {
  if (row.orderStatus === "fulfilled") return true;
  if (["failed", "refunded"].includes(row.orderStatus)) return false;
  return (
    row.paymentStatus === "completed" && isSupplierDeliveryComplete(row.apiStatus)
  );
}

/**
 * The order will not deliver: payment failed or the supplier API rejected it —
 * even if the line status is still stuck on queued/processing.
 */
export function isEffectivelyFailed(row: {
  orderStatus: string;
  paymentStatus: string;
  apiStatus: string | null;
}): boolean {
  if (row.orderStatus === "failed") return true;
  if (["fulfilled", "refunded"].includes(row.orderStatus)) return false;
  return row.paymentStatus === "failed" || isSupplierDeliveryFailed(row.apiStatus);
}
