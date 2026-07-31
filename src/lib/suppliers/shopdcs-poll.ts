import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { resolveSupplierDeliveryByReference } from "./dispatch";
import {
  fetchTransactionStatus,
  isShopDcsConfigured,
  mapShopDcsStatus,
} from "./shopdcs";

/** Poll Shop DCS for in-flight Telecel orders and mark them fulfilled/failed. */
export async function syncPendingShopDcsOrders(limit = 40): Promise<{
  polled: number;
  fulfilled: number;
  failed: number;
  stillProcessing: number;
}> {
  if (!hasSupabaseConfig() || !isShopDcsConfigured()) {
    return { polled: 0, fulfilled: 0, failed: 0, stillProcessing: 0 };
  }

  const service = createServiceClient();
  const ids = new Set<string>();

  const { data: customerRows } = await service
    .from("orders")
    .select("supplier_order_code, supplier_reference")
    .eq("supplier", "shopdcs")
    .in("status", ["processing", "queued"])
    .limit(limit);

  for (const row of customerRows ?? []) {
    const r = row as { supplier_order_code: string | null; supplier_reference: string | null };
    if (r.supplier_order_code) ids.add(r.supplier_order_code);
    else if (r.supplier_reference) ids.add(r.supplier_reference.split(",")[0]!);
  }

  // Wholesale parents tagged shopdcs that are still processing
  const { data: wholesaleRows } = await service
    .from("wholesale_orders")
    .select("id, supplier_reference")
    .eq("supplier", "shopdcs")
    .in("status", ["processing", "queued"])
    .limit(limit);

  for (const row of wholesaleRows ?? []) {
    const ref = (row as { supplier_reference: string | null }).supplier_reference;
    if (!ref) continue;
    for (const part of ref.split(",")) {
      const t = part.trim();
      if (t) ids.add(t);
    }
  }

  // Line-level codes for those parents
  const parentIds = ((wholesaleRows as { id: string }[] | null) ?? []).map((r) => r.id);
  if (parentIds.length > 0) {
    const { data: itemRows } = await service
      .from("wholesale_order_items")
      .select("supplier_order_code")
      .in("wholesale_order_id", parentIds)
      .not("supplier_order_code", "is", null)
      .limit(limit);
    for (const row of itemRows ?? []) {
      const code = (row as { supplier_order_code: string | null }).supplier_order_code;
      if (code) ids.add(code);
    }
  }

  const transactionIds = [...ids].slice(0, limit);
  let fulfilled = 0;
  let failed = 0;
  let stillProcessing = 0;

  for (const txnId of transactionIds) {
    const result = await fetchTransactionStatus(txnId);
    if (!result.ok) {
      stillProcessing += 1;
      continue;
    }
    const mapped = mapShopDcsStatus(result.data.status);
    if (mapped === "processing") {
      stillProcessing += 1;
      continue;
    }

    const resolution = await resolveSupplierDeliveryByReference({
      supplierReference: txnId,
      supplierOrderId: result.data.transaction_code
        ? String(result.data.transaction_code)
        : txnId,
      outcome: mapped,
      supplierStatus: result.data.status ?? mapped,
      rawPayload: result.data,
    });
    if (mapped === "fulfilled") {
      fulfilled += resolution.customerOrdersFulfilled + resolution.wholesaleItemsFulfilled;
    } else {
      failed += 1;
    }
  }

  return {
    polled: transactionIds.length,
    fulfilled,
    failed,
    stillProcessing,
  };
}
