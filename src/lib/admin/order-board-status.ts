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

type BoardStatusRow = {
  orderStatus: string;
  paymentStatus: string;
  apiStatus: string | null;
};

/**
 * Undelivered = waiting for MANUAL delivery. The dispatcher only moves a line
 * to `processing` when an automated supplier API accepts it, so anything still
 * on queued/pending/paid (and not delivered or failed) needs a human to send it.
 */
export function isAwaitingManualDelivery(row: BoardStatusRow): boolean {
  if (!["queued", "pending", "paid"].includes(row.orderStatus)) return false;
  return !isEffectivelyFulfilled(row) && !isEffectivelyFailed(row);
}

/** Processing = a supplier API accepted the order and is handling delivery. */
export function isApiProcessing(row: BoardStatusRow): boolean {
  if (row.orderStatus !== "processing") return false;
  return !isEffectivelyFulfilled(row) && !isEffectivelyFailed(row);
}

/** Uniform admin-facing labels: fulfilled → delivered, queued/pending/paid → undelivered. */
export function orderStatusDisplayLabel(status: string): string {
  if (status === "fulfilled") return "delivered";
  if (["queued", "pending", "paid"].includes(status)) return "undelivered";
  return status;
}
