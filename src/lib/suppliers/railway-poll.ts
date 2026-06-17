import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { resolveSupplierItemsProcessed } from "./dispatch";
import {
  isRailwayExternalConfigured,
  mapRailwayStatus,
  pollOrdersStatusBulk,
} from "./railway-external";

/** Poll Railway for in-flight orders and mark them fulfilled/failed in DCS. */
export async function syncPendingRailwayOrders(limit = 50): Promise<{
  polled: number;
  fulfilled: number;
  failed: number;
}> {
  if (!hasSupabaseConfig() || !isRailwayExternalConfigured()) {
    return { polled: 0, fulfilled: 0, failed: 0 };
  }

  const service = createServiceClient();
  const ids = new Set<string>();

  const { data: customerRows } = await service
    .from("orders")
    .select("supplier_order_code, supplier_reference")
    .eq("supplier", "railwayexternal")
    .in("status", ["processing", "queued"])
    .limit(limit);

  for (const row of customerRows ?? []) {
    const r = row as { supplier_order_code: string | null; supplier_reference: string | null };
    if (r.supplier_order_code) ids.add(r.supplier_order_code);
    else if (r.supplier_reference) ids.add(r.supplier_reference.split(",")[0]!);
  }

  const { data: wholesaleRows } = await service
    .from("wholesale_orders")
    .select("supplier_reference")
    .eq("supplier", "railwayexternal")
    .in("status", ["processing", "queued"])
    .limit(limit);

  for (const row of wholesaleRows ?? []) {
    const r = row as { supplier_reference: string | null };
    const ref = r.supplier_reference;
    if (ref) ids.add(ref.split(",")[0]!);
  }

  const orderIds = [...ids].slice(0, 50);
  if (orderIds.length === 0) return { polled: 0, fulfilled: 0, failed: 0 };

  const result = await pollOrdersStatusBulk(orderIds);
  if (!result.ok) {
    throw new Error(result.error);
  }

  let fulfilled = 0;
  let failed = 0;

  for (const row of result.data) {
    const mapped = mapRailwayStatus(row.status);
    if (mapped === "processing") continue;

    const resolution = await resolveSupplierItemsProcessed({
      supplierReference: row.orderId,
      orderCodes: [row.orderId],
      status: mapped === "fulfilled" ? "PROCESSED" : "FAILED",
      rawPayload: row,
    });
    fulfilled += resolution.customerOrdersFulfilled + resolution.wholesaleItemsFulfilled;
    if (mapped === "failed") failed += 1;
  }

  return { polled: result.data.length, fulfilled, failed };
}
