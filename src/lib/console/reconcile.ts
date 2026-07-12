import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { creditConsoleBalance } from "@/lib/console/account";
import { getResolvedSupplierForNetwork } from "@/lib/suppliers/routing";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";

const MAX_RETRIES_PER_RUN = 10;

/**
 * Re-dispatch console sends that landed on manual while the network now routes
 * through an automated supplier (e.g. AT switched back to iShare).
 */
export async function reconcileStuckConsoleSends(
  vendorId?: string,
): Promise<{ scanned: number; completed: number; failed: number }> {
  if (!hasSupabaseConfig()) return { scanned: 0, completed: 0, failed: 0 };

  const service = createServiceClient();
  let query = service
    .from("console_send_ledger")
    .select(
      "id, vendor_id, recipient_phone, network, amount_mb, reference, status, supplier, supplier_status",
    )
    .in("status", ["processing", "pending"])
    .is("completed_at", null)
    .or("supplier.eq.manual,supplier_status.eq.awaiting_manual")
    .order("created_at", { ascending: true })
    .limit(MAX_RETRIES_PER_RUN);

  if (vendorId) query = query.eq("vendor_id", vendorId);

  const { data: stuck } = await query;
  if (!stuck?.length) return { scanned: 0, completed: 0, failed: 0 };

  let completed = 0;
  let failed = 0;

  for (const raw of stuck) {
    const row = raw as {
      id: string;
      vendor_id: string;
      recipient_phone: string;
      network: string;
      amount_mb: number;
      reference: string;
    };

    const supplier = await getResolvedSupplierForNetwork(row.network as SupplierNetworkSlug);
    if (supplier.id === "manual") continue;

    const result = await supplier.submitSingle({
      network: row.network as SupplierNetworkSlug,
      msisdn: row.recipient_phone,
      volumeMb: Number(row.amount_mb),
      reference: row.reference,
      scope: "console_send",
    });

    const now = new Date().toISOString();

    if (result.manual) {
      await service
        .from("console_send_ledger")
        .update({
          status: "pending",
          supplier: supplier.id,
          supplier_status: "awaiting_manual",
        })
        .eq("id", row.id);
      continue;
    }

    if (!result.ok) {
      const restored = await creditConsoleBalance(row.vendor_id, Number(row.amount_mb));
      await service
        .from("console_send_ledger")
        .update({
          status: "failed",
          supplier: supplier.id,
          supplier_status: "failed",
          supplier_error: (result.error ?? "Supplier rejected order").slice(0, 500),
          balance_after_mb: restored,
          completed_at: now,
        })
        .eq("id", row.id);
      failed += 1;
      continue;
    }

    await service
      .from("console_send_ledger")
      .update({
        status: "completed",
        supplier: supplier.id,
        supplier_reference: result.reference ?? row.reference,
        supplier_status: result.status ?? "delivered",
        supplier_error: null,
        completed_at: now,
      })
      .eq("id", row.id);
    completed += 1;
  }

  return { scanned: stuck.length, completed, failed };
}
