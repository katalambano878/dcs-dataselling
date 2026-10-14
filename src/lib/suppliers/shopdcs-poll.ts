import "server-only";

import { after } from "next/server";
import { syncWholesaleOrderFromItems } from "@/lib/admin/wholesale-order-sync";
import { notifyVendorWholesaleFulfilled, notifyWholesaleItemDelivered } from "@/lib/notifications/wholesale-sms";
import { refundWholesaleOrderToWallet } from "@/lib/payments/wallet";
import { tryCreditReferralForWholesaleItem } from "@/lib/referrals/vendor-referral";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  fetchTransactionStatus,
  isShopDcsConfigured,
  mapShopDcsStatus,
  shopDcsStatusForLine,
} from "./shopdcs";

const OPEN_SUPPLIER_STATUSES = new Set([
  "accepted",
  "pending",
  "processing",
  "queued",
  // Shop DCS returns this at purchase time, then later flips the same line to DELIVERED.
  "undelivered",
]);

type Line = {
  id: string;
  wholesale_order_id: string;
  recipient_phone: string;
  status: string;
  supplier_status: string | null;
  supplier_order_code: string | null;
};

/** Poll shopdcsgh.com and copy each Telecel line status onto this site. */
export async function syncPendingShopDcsOrders(limit = 40): Promise<{
  polled: number;
  fulfilled: number;
  failed: number;
  stillProcessing: number;
  updated: number;
}> {
  if (!hasSupabaseConfig() || !isShopDcsConfigured()) {
    return { polled: 0, fulfilled: 0, failed: 0, stillProcessing: 0, updated: 0 };
  }

  const service = createServiceClient();
  const lines = await loadOpenLines(service, limit);
  const byTxn = new Map<string, Line[]>();
  for (const line of lines) {
    const code = line.supplier_order_code?.trim();
    if (!code) continue;
    const group = byTxn.get(code) ?? [];
    group.push(line);
    byTxn.set(code, group);
  }

  let fulfilled = 0;
  let failed = 0;
  let stillProcessing = 0;
  let updated = 0;
  const parentsToSync = new Set<string>();
  const parentStatus = new Map<string, string>();

  for (const [txnId, group] of byTxn) {
    const result = await fetchTransactionStatus(txnId);
    if (!result.ok) {
      stillProcessing += group.length;
      continue;
    }

    for (const line of group) {
      const rawStatus = shopDcsStatusForLine(result.data, line.recipient_phone);
      const mapped = mapShopDcsStatus(rawStatus);
      if (!rawStatus || mapped === "processing") {
        if (rawStatus && line.supplier_status !== rawStatus) {
          await service
            .from("wholesale_order_items")
            .update({ supplier_status: rawStatus, supplier_response: result.data })
            .eq("id", line.id);
          updated += 1;
        }
        stillProcessing += 1;
        continue;
      }

      const nextStatus = mapped;
      if (line.supplier_status === rawStatus && line.status === nextStatus) continue;

      const becameFulfilled = nextStatus === "fulfilled" && line.status !== "fulfilled";
      const becameFailed = nextStatus === "failed" && line.status !== "failed";
      const patch: Record<string, unknown> = {
        supplier_status: rawStatus,
        supplier_response: result.data,
      };
      const stillOpen = line.status === "queued" || line.status === "processing" || line.status === "pending";
      // UNDELIVERED is not final. If the shop later says DELIVERED, correct a
      // line that was left failed or still open.
      const correctUndelivered = nextStatus === "fulfilled" && line.status === "failed";
      if (stillOpen || correctUndelivered) {
        patch.status = nextStatus;
        if (becameFulfilled || correctUndelivered) {
          patch.supplier_fulfilled_at = new Date().toISOString();
        }
      }

      const { error } = await service.from("wholesale_order_items").update(patch).eq("id", line.id);
      if (error) continue;

      updated += 1;
      if (becameFulfilled && patch.status === "fulfilled") {
        fulfilled += 1;
        parentsToSync.add(line.wholesale_order_id);
        after(() => tryCreditReferralForWholesaleItem(line.id));
        after(() => notifyWholesaleItemDelivered(line.id));
      } else if (becameFailed && patch.status === "failed") {
        failed += 1;
        parentsToSync.add(line.wholesale_order_id);
      }
    }
  }

  if (parentsToSync.size > 0) {
    const { data } = await service
      .from("wholesale_orders")
      .select("id, status")
      .in("id", [...parentsToSync]);
    for (const raw of data ?? []) {
      const row = raw as { id: string; status: string };
      parentStatus.set(row.id, row.status);
    }
  }

  for (const parentId of parentsToSync) {
    const previous = parentStatus.get(parentId) ?? "processing";
    await syncWholesaleOrderFromItems(service, parentId);
    const { data } = await service
      .from("wholesale_orders")
      .select("status")
      .eq("id", parentId)
      .maybeSingle();
    const next = (data as { status?: string } | null)?.status;
    if (next === "failed" && (previous === "processing" || previous === "queued")) {
      await refundWholesaleOrderToWallet(parentId);
    }
    if (next === "fulfilled" && previous !== "fulfilled") {
      await service.from("wholesale_orders").update({ supplier_status: "DELIVERED" }).eq("id", parentId);
      after(() => notifyVendorWholesaleFulfilled(parentId));
    }
  }

  return { polled: byTxn.size, fulfilled, failed, stillProcessing, updated };
}

async function loadOpenLines(
  service: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<Line[]> {
  const { data: parents } = await service
    .from("wholesale_orders")
    .select("id")
    .eq("supplier", "shopdcs")
    .order("created_at", { ascending: false })
    .limit(250);
  const parentIds = ((parents ?? []) as { id: string }[]).map((row) => row.id);
  if (parentIds.length === 0) return [];

  const { data } = await service
    .from("wholesale_order_items")
    .select("id, wholesale_order_id, recipient_phone, status, supplier_status, supplier_order_code, created_at")
    .in("wholesale_order_id", parentIds)
    .order("created_at", { ascending: false })
    .limit(500);

  const open: Line[] = [];
  for (const raw of data ?? []) {
    const line = raw as Line;
    const code = line.supplier_order_code?.trim() ?? "";
    if (!/^txn_/i.test(code)) continue;
    const state = (line.supplier_status ?? "").toLowerCase();
    if (state && !OPEN_SUPPLIER_STATUSES.has(state)) continue;
    open.push(line);
    if (open.length >= limit) break;
  }
  return open;
}
