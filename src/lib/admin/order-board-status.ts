import { isSupplierDeliveryComplete } from "@/lib/suppliers/delivery-status";

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
