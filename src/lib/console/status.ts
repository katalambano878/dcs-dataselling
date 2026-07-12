/** Uniform console status labels aligned with the admin order board. */
export function consoleStatusDisplayLabel(row: {
  status: string;
  supplierStatus: string | null;
}): string {
  if (row.status === "completed") return "delivered";
  if (row.status === "failed") return "failed";
  if (row.supplierStatus === "awaiting_manual" || row.status === "pending") {
    return "undelivered";
  }
  if (row.status === "processing") return "processing";
  return row.status;
}

export function consoleStatusBadgeVariant(row: {
  status: string;
  supplierStatus: string | null;
}): "success" | "warning" | "danger" | "neutral" {
  const label = consoleStatusDisplayLabel(row);
  if (label === "delivered") return "success";
  if (label === "failed") return "danger";
  if (label === "undelivered") return "warning";
  if (label === "processing") return "warning";
  return "neutral";
}

/** Row is waiting for manual delivery (supplier API is off for this network). */
export function isConsoleSendAwaitingManual(row: {
  status: string;
  supplierStatus: string | null;
  supplier: string | null;
}): boolean {
  return (
    row.supplier === "manual" ||
    row.supplierStatus === "awaiting_manual" ||
    row.status === "pending"
  );
}

/** Row was accepted by a supplier API and delivery is in flight. */
export function isConsoleSendApiProcessing(row: {
  status: string;
  supplierStatus: string | null;
}): boolean {
  return row.status === "processing" && row.supplierStatus !== "awaiting_manual";
}
