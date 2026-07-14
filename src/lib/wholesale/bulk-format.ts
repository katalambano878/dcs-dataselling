/** Plain GB number for bulk paste/export (no "GB" suffix). 1 GB = 1000 MB. */
export function dataMbToVolumeGb(dataMb: number): number {
  if (!dataMb || dataMb <= 0) return 0;
  if (dataMb >= 1000) {
    const gb = dataMb / 1000;
    return gb % 1 === 0 ? gb : Math.round(gb * 10) / 10;
  }
  return Math.round((dataMb / 1000) * 100) / 100;
}

export function networkPackageLabel(network: string): string {
  const n = network.trim().toLowerCase();
  if (n === "mtn") return "MTN";
  if (n === "telecel") return "TELECEL";
  if (n === "at") return "AT";
  return network ? network.toUpperCase() : "—";
}

export function exportOrderTypeLabel(orderType: string): string {
  switch (orderType) {
    case "storefront":
      return "SINGLE";
    case "manual":
    case "internal":
      return "Internal";
    case "bulk":
      return "bulk";
    default:
      return orderType;
  }
}

/** One line for the agent bulk paste box: `0241234567 10` */
export function formatBulkPasteLine(phone: string, volumeGb: number): string {
  const vol = volumeGb % 1 === 0 ? String(volumeGb) : String(volumeGb);
  return `${phone} ${vol}`.trim();
}

/** One Excel row: Number and Volume in separate columns (tab-separated). */
export function formatBulkExcelRow(phone: string, volumeGb: number): string {
  const vol = volumeGb % 1 === 0 ? String(volumeGb) : String(volumeGb);
  return `${phone}\t${vol}`;
}

export interface BulkExcelClipboardRow {
  phone: string;
  volumeGb: number;
}

/**
 * Clipboard text for admin Copy for paste — pastes into Excel as Number | Volume columns.
 * Includes header row so Excel splits correctly on first paste.
 */
export function buildBulkExcelClipboard(
  rows: BulkExcelClipboardRow[],
  options?: { includeHeader?: boolean },
): string {
  const includeHeader = options?.includeHeader !== false;
  const dataLines = rows
    .filter((r) => r.phone && r.volumeGb > 0)
    .map((r) => formatBulkExcelRow(r.phone, r.volumeGb));

  if (dataLines.length === 0) return "";

  if (includeHeader) {
    return ["Number\tVolume", ...dataLines].join("\n");
  }
  return dataLines.join("\n");
}

export const BULK_TEMPLATE_HEADERS = ["Number", "Volume", "Order Type", "Package"] as const;

export const BULK_ORDER_TEMPLATE_CSV = [
  BULK_TEMPLATE_HEADERS.join(","),
  "0241234567,10,SINGLE,MTN",
  "0551234567,20,bulk,MTN",
  "0201234567,5,wholesale,MTN",
].join("\n");
