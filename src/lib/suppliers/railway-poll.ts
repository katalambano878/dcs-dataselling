import "server-only";

import { after } from "next/server";
import { syncWholesaleOrderFromItems } from "@/lib/admin/wholesale-order-sync";
import { notifyVendorWholesaleFulfilled, notifyWholesaleItemDelivered } from "@/lib/notifications/wholesale-sms";
import { refundWholesaleOrderToWallet } from "@/lib/payments/wallet";
import { tryCreditReferralForCustomerOrder, tryCreditReferralForWholesaleItem } from "@/lib/referrals/vendor-referral";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  isRailwayExternalConfigured,
  mapRailwayStatus,
  pollOrdersStatusBulk,
  railwayOrderIdNumber,
  railwayStatusForLine,
  type RailwayOrderItem,
} from "./railway-external";

const OPEN_SUPPLIER_STATUSES = [
  "Pending",
  "pending",
  "accepted",
  "Processing",
  "processing",
  "Queued",
  "queued",
];

type WholesaleLine = {
  id: string;
  wholesale_order_id: string;
  recipient_phone: string;
  status: string;
  supplier_status: string | null;
  supplier_order_code: string | null;
};

type CustomerLine = {
  id: string;
  recipient_phone: string;
  status: string;
  supplier_status: string | null;
  supplier_order_code: string | null;
  supplier_reference: string | null;
};

type NovaOrder = { orderId: string; status: string; items: RailwayOrderItem[] };

/** Poll NovaMax for Railway orders and copy each line's status onto the site. */
export async function syncPendingRailwayOrders(limit = 50): Promise<{
  polled: number;
  fulfilled: number;
  failed: number;
  updated: number;
}> {
  if (!hasSupabaseConfig() || !isRailwayExternalConfigured()) {
    return { polled: 0, fulfilled: 0, failed: 0, updated: 0 };
  }

  const service = createServiceClient();
  const orderIds = await collectRailwayOrderIds(service, limit);
  if (orderIds.length === 0) return { polled: 0, fulfilled: 0, failed: 0, updated: 0 };

  const result = await pollOrdersStatusBulk(orderIds.map(String));
  if (!result.ok) {
    throw new Error(result.error);
  }

  const codes = result.data.map((row) => String(row.orderId));
  const [wholesaleLines, customerLines] = await Promise.all([
    loadWholesaleLines(service, codes),
    loadCustomerLines(service, codes),
  ]);
  const parentStatuses = await loadParentStatuses(service, wholesaleLines);

  let fulfilled = 0;
  let failed = 0;
  let updated = 0;
  const parentsToSync = new Set<string>();

  for (const row of result.data) {
    const applied = await applyNovaOrder(service, row, wholesaleLines, customerLines, parentsToSync);
    fulfilled += applied.fulfilled;
    failed += applied.failed;
    updated += applied.updated;
  }

  for (const parentId of parentsToSync) {
    const previous = parentStatuses.get(parentId) ?? "processing";
    await syncWholesaleOrderFromItems(service, parentId);
    await rollupParentSupplierStatus(service, parentId);
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
      after(() => notifyVendorWholesaleFulfilled(parentId));
    }
  }

  return { polled: result.data.length, fulfilled, failed, updated };
}

async function collectRailwayOrderIds(
  service: ReturnType<typeof createServiceClient>,
  limit: number,
): Promise<number[]> {
  const ids = new Set<number>();

  const { data: parents } = await service
    .from("wholesale_orders")
    .select("id, status")
    .eq("supplier", "railwayexternal")
    .order("created_at", { ascending: false })
    .limit(400);

  const parentRows = (parents ?? []) as { id: string; status: string }[];
  const openParentIds = new Set(
    parentRows.filter((row) => row.status === "processing" || row.status === "queued").map((row) => row.id),
  );

  if (parentRows.length > 0) {
    const { data: items } = await service
      .from("wholesale_order_items")
      .select("wholesale_order_id, supplier_order_code, supplier_status, created_at")
      .in(
        "wholesale_order_id",
        parentRows.map((row) => row.id),
      )
      .order("created_at", { ascending: false })
      .limit(800);

    for (const raw of items ?? []) {
      const item = raw as {
        wholesale_order_id: string;
        supplier_order_code: string | null;
        supplier_status: string | null;
      };
      const open =
        openParentIds.has(item.wholesale_order_id) ||
        OPEN_SUPPLIER_STATUSES.includes(item.supplier_status ?? "");
      if (!open) continue;
      const id = railwayOrderIdNumber(item.supplier_order_code);
      if (id) ids.add(id);
      if (ids.size >= limit) return [...ids];
    }
  }

  const { data: customers } = await service
    .from("orders")
    .select("status, supplier_status, supplier_order_code, supplier_reference")
    .eq("supplier", "railwayexternal")
    .order("created_at", { ascending: false })
    .limit(200);

  for (const raw of customers ?? []) {
    const row = raw as {
      status: string;
      supplier_status: string | null;
      supplier_order_code: string | null;
      supplier_reference: string | null;
    };
    const open =
      row.status === "processing" ||
      row.status === "queued" ||
      OPEN_SUPPLIER_STATUSES.includes(row.supplier_status ?? "");
    if (!open) continue;
    const id =
      railwayOrderIdNumber(row.supplier_order_code) ??
      railwayOrderIdNumber(row.supplier_reference);
    if (id) ids.add(id);
    if (ids.size >= limit) break;
  }

  return [...ids].slice(0, limit);
}

async function loadWholesaleLines(
  service: ReturnType<typeof createServiceClient>,
  codes: string[],
): Promise<WholesaleLine[]> {
  if (codes.length === 0) return [];
  const { data } = await service
    .from("wholesale_order_items")
    .select("id, wholesale_order_id, recipient_phone, status, supplier_status, supplier_order_code")
    .in("supplier_order_code", codes);
  return (data ?? []) as WholesaleLine[];
}

async function loadCustomerLines(
  service: ReturnType<typeof createServiceClient>,
  codes: string[],
): Promise<CustomerLine[]> {
  if (codes.length === 0) return [];
  const { data } = await service
    .from("orders")
    .select("id, recipient_phone, status, supplier_status, supplier_order_code, supplier_reference")
    .eq("supplier", "railwayexternal")
    .in("supplier_order_code", codes);
  return (data ?? []) as CustomerLine[];
}

async function loadParentStatuses(
  service: ReturnType<typeof createServiceClient>,
  lines: WholesaleLine[],
): Promise<Map<string, string>> {
  const statuses = new Map<string, string>();
  const ids = [...new Set(lines.map((line) => line.wholesale_order_id))];
  if (ids.length === 0) return statuses;
  const { data } = await service.from("wholesale_orders").select("id, status").in("id", ids);
  for (const raw of data ?? []) {
    const row = raw as { id: string; status: string };
    statuses.set(row.id, row.status);
  }
  return statuses;
}

async function applyNovaOrder(
  service: ReturnType<typeof createServiceClient>,
  row: NovaOrder,
  wholesaleLines: WholesaleLine[],
  customerLines: CustomerLine[],
  parentsToSync: Set<string>,
): Promise<{ fulfilled: number; failed: number; updated: number }> {
  const code = String(row.orderId);
  let fulfilled = 0;
  let failed = 0;
  let updated = 0;
  const now = new Date().toISOString();

  for (const line of wholesaleLines.filter((item) => item.supplier_order_code === code)) {
    const rawStatus = railwayStatusForLine(row.status, row.items, line.recipient_phone);
    const mapped = mapRailwayStatus(rawStatus);
    if (mapped === "processing" && line.supplier_status === rawStatus) continue;

    const nextStatus = mapped === "processing" ? line.status : mapped;
    const becameFulfilled = nextStatus === "fulfilled" && line.status !== "fulfilled";
    const becameFailed = nextStatus === "failed" && line.status !== "failed";
    const patch: Record<string, unknown> = {
      status: nextStatus,
      supplier_status: rawStatus,
      supplier_response: { orderId: row.orderId, status: row.status, items: row.items },
    };
    if (becameFulfilled) patch.supplier_fulfilled_at = now;
    const { error } = await service.from("wholesale_order_items").update(patch).eq("id", line.id);
    if (error) continue;

    updated += 1;
    if (becameFulfilled) fulfilled += 1;
    if (becameFailed) failed += 1;
    if (nextStatus !== line.status) parentsToSync.add(line.wholesale_order_id);
    if (becameFulfilled) {
      after(() => tryCreditReferralForWholesaleItem(line.id));
      after(() => notifyWholesaleItemDelivered(line.id));
    }
  }

  for (const line of customerLines.filter((item) => item.supplier_order_code === code)) {
    const rawStatus = railwayStatusForLine(row.status, row.items, line.recipient_phone);
    const mapped = mapRailwayStatus(rawStatus);
    if (mapped === "processing" && line.supplier_status === rawStatus) continue;

    const nextStatus = mapped === "processing" ? line.status : mapped;
    const becameFulfilled = nextStatus === "fulfilled" && line.status !== "fulfilled";
    const becameFailed = nextStatus === "failed" && line.status !== "failed";
    const patch: Record<string, unknown> = {
      status: nextStatus,
      supplier_status: rawStatus,
      supplier_response: { orderId: row.orderId, status: row.status, items: row.items },
    };
    if (becameFulfilled) patch.fulfilled_at = now;
    const { error } = await service.from("orders").update(patch).eq("id", line.id);
    if (error) continue;

    updated += 1;
    if (becameFulfilled) fulfilled += 1;
    if (becameFailed) failed += 1;
    if (becameFulfilled) after(() => tryCreditReferralForCustomerOrder(line.id));
  }

  return { fulfilled, failed, updated };
}

async function rollupParentSupplierStatus(
  service: ReturnType<typeof createServiceClient>,
  parentId: string,
): Promise<void> {
  const { data } = await service
    .from("wholesale_order_items")
    .select("supplier_status")
    .eq("wholesale_order_id", parentId);
  const statuses = ((data ?? []) as { supplier_status: string | null }[])
    .map((row) => row.supplier_status)
    .filter((status): status is string => Boolean(status));
  if (statuses.length === 0) return;

  const mapped = statuses.map((status) => mapRailwayStatus(status));
  let supplierStatus = "Processing";
  if (mapped.every((status) => status === "fulfilled")) supplierStatus = "Completed";
  else if (mapped.every((status) => status === "failed")) supplierStatus = "Cancelled";
  else if (mapped.some((status) => status === "failed") && mapped.every((status) => status !== "processing")) {
    supplierStatus = "partial";
  }

  await service.from("wholesale_orders").update({ supplier_status: supplierStatus }).eq("id", parentId);
}
