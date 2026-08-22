import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { creditConsoleBalance } from "@/lib/console/account";
import { resolveSupplierDeliveryByReference } from "./dispatch";
import {
  fetchAdaayaTransaction,
  isAdaayaConfigured,
  isAdaayaTransactionId,
  mapAdaayaStatus,
} from "./adaaya";

/** Poll Adaaya for in-flight AT orders (storefront, wholesale, console). */
export async function syncPendingAdaayaOrders(limit = 40): Promise<{
  polled: number;
  fulfilled: number;
  failed: number;
  stillProcessing: number;
  consoleUpdated: number;
}> {
  if (!hasSupabaseConfig() || !isAdaayaConfigured()) {
    return { polled: 0, fulfilled: 0, failed: 0, stillProcessing: 0, consoleUpdated: 0 };
  }

  const service = createServiceClient();
  const ids = new Set<string>();

  const { data: customerRows } = await service
    .from("orders")
    .select("supplier_order_code, supplier_reference")
    .eq("supplier", "adaaya")
    .in("status", ["processing", "queued"])
    .limit(limit);

  for (const row of customerRows ?? []) {
    const r = row as { supplier_order_code: string | null; supplier_reference: string | null };
    for (const cand of [r.supplier_order_code, r.supplier_reference]) {
      if (cand && isAdaayaTransactionId(cand)) ids.add(cand.trim());
    }
  }

  const { data: wholesaleRows } = await service
    .from("wholesale_orders")
    .select("id, supplier_reference")
    .eq("supplier", "adaaya")
    .in("status", ["processing", "queued", "failed"])
    .limit(limit);

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
      if (code && isAdaayaTransactionId(code)) ids.add(code.trim());
    }
  }

  const { data: consoleRows } = await service
    .from("console_send_ledger")
    .select("id, supplier_reference, vendor_id, amount_mb, status")
    .eq("supplier", "adaaya")
    .in("status", ["processing", "pending"])
    .is("completed_at", null)
    .limit(limit);

  type ConsoleRow = {
    id: string;
    supplier_reference: string | null;
    vendor_id: string;
    amount_mb: number;
    status: string;
  };
  const consoleByTxn = new Map<string, ConsoleRow>();
  for (const raw of (consoleRows ?? []) as ConsoleRow[]) {
    const ref = raw.supplier_reference?.trim();
    if (ref && isAdaayaTransactionId(ref)) {
      ids.add(ref);
      consoleByTxn.set(ref, raw);
    }
  }

  const transactionIds = [...ids].slice(0, limit);
  let fulfilled = 0;
  let failed = 0;
  let stillProcessing = 0;
  let consoleUpdated = 0;

  for (const txnId of transactionIds) {
    const result = await fetchAdaayaTransaction(txnId);
    if (!result.ok) {
      stillProcessing += 1;
      continue;
    }

    const mapped = mapAdaayaStatus(result.data.status);
    if (mapped === "processing") {
      stillProcessing += 1;
      continue;
    }

    const resolution = await resolveSupplierDeliveryByReference({
      supplierReference: txnId,
      supplierOrderId: txnId,
      outcome: mapped,
      supplierStatus: result.data.status,
      rawPayload: result.data,
    });
    if (mapped === "fulfilled") {
      fulfilled += resolution.customerOrdersFulfilled + resolution.wholesaleItemsFulfilled;
    } else {
      failed += 1;
    }

    const consoleRow = consoleByTxn.get(txnId);
    if (consoleRow) {
      const now = new Date().toISOString();
      if (mapped === "fulfilled") {
        await service
          .from("console_send_ledger")
          .update({
            status: "completed",
            supplier_status: result.data.status,
            supplier_error: null,
            completed_at: now,
          })
          .eq("id", consoleRow.id)
          .is("completed_at", null);
        consoleUpdated += 1;
      } else {
        const restored = await creditConsoleBalance(
          consoleRow.vendor_id,
          Number(consoleRow.amount_mb),
        );
        const failMsg = [
          result.data.failure_code,
          result.data.failure_description,
          result.data.failure_reason,
        ]
          .filter(Boolean)
          .join(" — ")
          .slice(0, 500);
        await service
          .from("console_send_ledger")
          .update({
            status: "failed",
            supplier_status: "failed",
            supplier_error: failMsg || "Adaaya delivery failed",
            balance_after_mb: restored,
            completed_at: now,
          })
          .eq("id", consoleRow.id)
          .is("completed_at", null);
        consoleUpdated += 1;
        failed += 1;
      }
    }
  }

  return {
    polled: transactionIds.length,
    fulfilled,
    failed,
    stillProcessing,
    consoleUpdated,
  };
}
