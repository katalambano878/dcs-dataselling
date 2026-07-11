const SUPPLIER_DELIVERY_COMPLETE = new Set([
  "processed",
  "fully_processed",
  "partially_processed",
  "fulfilled",
  "delivered",
  "complete",
  "completed",
  "success",
]);

const SUPPLIER_IN_FLIGHT = new Set([
  "accepted",
  "awaiting_manual",
  "pending",
  "queued",
  "processing",
]);

const SUPPLIER_FAILED = new Set([
  "failed",
  "undelivered",
  "cancelled",
  "canceled",
  "rejected",
  "error",
]);

export function normalizeSupplierStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

/** Statuses the admin board's failed-order queries match against (supplier_status column). */
export const SUPPLIER_FAILED_STATUSES: readonly string[] = [...SUPPLIER_FAILED];

/** Supplier API reports the data bundle was delivered (not merely accepted). */
export function isSupplierDeliveryComplete(supplierStatus: string | null | undefined): boolean {
  const normalized = normalizeSupplierStatus(supplierStatus);
  if (!normalized) return false;
  if (SUPPLIER_IN_FLIGHT.has(normalized) || SUPPLIER_FAILED.has(normalized)) return false;
  if (SUPPLIER_DELIVERY_COMPLETE.has(normalized)) return true;
  if (
    normalized.includes("successful") ||
    normalized.includes("delivered") ||
    normalized.includes("processed")
  ) {
    return true;
  }
  return false;
}

/** Supplier API reports the send failed / was rejected — the bundle will not arrive. */
export function isSupplierDeliveryFailed(supplierStatus: string | null | undefined): boolean {
  const normalized = normalizeSupplierStatus(supplierStatus);
  if (!normalized) return false;
  if (SUPPLIER_IN_FLIGHT.has(normalized) || SUPPLIER_DELIVERY_COMPLETE.has(normalized)) return false;
  if (SUPPLIER_FAILED.has(normalized)) return true;
  return (
    normalized.includes("fail") ||
    normalized.includes("reject") ||
    normalized.includes("cancel")
  );
}

export function isPaymentSettledForWholesale(
  orderStatus: string,
  paymentReference: string | null,
): boolean {
  if (orderStatus === "pending") return false;
  if (orderStatus === "refunded") return false;
  if (paymentReference) return true;
  return ["queued", "processing", "fulfilled", "failed"].includes(orderStatus);
}

export function isPaymentSettledForCustomer(orderStatus: string): boolean {
  return ["paid", "queued", "processing", "fulfilled", "failed"].includes(orderStatus);
}

/** Map supplier response to the line status admins see on the order board. */
export function resolveLineStatusFromSupplier(
  supplierStatus: string | null | undefined,
): "fulfilled" | "processing" | "queued" {
  if (isSupplierDeliveryComplete(supplierStatus)) return "fulfilled";
  if (normalizeSupplierStatus(supplierStatus) === "awaiting_manual") return "queued";
  if (supplierStatus) return "processing";
  return "queued";
}
