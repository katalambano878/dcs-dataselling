import "server-only";

import { after } from "next/server";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { deliverVendorWebhook } from "@/lib/notifications/vendor-webhook";
import {
  notifyVendorWholesaleFulfilled,
  notifyWholesaleItemDelivered,
} from "@/lib/notifications/wholesale-sms";
import {
  tryCreditReferralForCustomerOrder,
  tryCreditReferralForWholesaleItem,
} from "@/lib/referrals/vendor-referral";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";
import { getResolvedSupplierForNetwork } from "./routing";
import type { SupplierClient, SupplierNetworkSlug } from "./types";

/**
 * Dispatch a paid customer storefront order to the correct supplier for its
 * network. Called from the Paystack webhook after the order is marked `queued`.
 *
 * Behaviour:
 *  - Supplier accepted    -> status `processing`, record supplier_reference
 *  - Supplier rejected    -> status `failed`, record error (admin can retry)
 *  - Supplier unreachable -> leave status `queued`, record error (retry-able)
 *  - Supplier is manual   -> leave status `queued`, supplier_status="awaiting_manual"
 */
export async function dispatchCustomerOrderToSupplier(orderId: string): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const service = createServiceClient();
  const { data, error } = await service
    .from("orders")
    .select("id, reference, status, recipient_phone, supplier_reference, bundle_id")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !data) {
    console.error("[dispatch customer]", error);
    return;
  }

  const row = data as {
    id: string;
    reference: string;
    status: string;
    recipient_phone: string;
    supplier_reference: string | null;
    bundle_id: string;
  };

  if (row.supplier_reference) return; // already submitted
  if (!["paid", "queued"].includes(row.status)) return;

  const bundle = await fetchStorefrontOrderBundle(service, row.bundle_id);
  if (!bundle) {
    await service
      .from("orders")
      .update({
        supplier_status: "failed",
        supplier_error: "Bundle missing",
      })
      .eq("id", row.id);
    return;
  }

  const supplier = await getResolvedSupplierForNetwork(bundle.network);

  const result = await supplier.submitSingle({
    network: bundle.network,
    msisdn: row.recipient_phone,
    volumeMb: bundle.data_mb,
    reference: row.reference,
    scope: "customer_order",
  });

  if (result.manual) {
    await service
      .from("orders")
      .update({
        supplier: supplier.id,
        supplier_status: "awaiting_manual",
        supplier_error: null,
        supplier_submitted_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return;
  }

  if (!result.ok) {
    await service
      .from("orders")
      .update({
        supplier: supplier.id,
        supplier_status: "failed",
        supplier_error: (result.error ?? "Unknown supplier error").slice(0, 500),
        supplier_submitted_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    return;
  }

  await service
    .from("orders")
    .update({
      status: "processing",
      supplier: supplier.id,
      supplier_reference: result.reference ?? null,
      supplier_order_code: result.orderCode ?? null,
      supplier_status: result.status ?? "accepted",
      supplier_response: (result.rawResponse as object | undefined) ?? null,
      supplier_submitted_at: new Date().toISOString(),
      supplier_error: null,
    })
    .eq("id", row.id);
}

/**
 * Dispatch a paid vendor wholesale order. Items are grouped by network and
 * each group is submitted to the supplier configured for that network.
 * A single wholesale order can therefore touch multiple suppliers.
 */
export async function dispatchWholesaleOrderToSupplier(orderId: string): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const service = createServiceClient();

  const { data: order, error } = await service
    .from("wholesale_orders")
    .select(
      `
      id, reference, status, supplier_reference,
      wholesale_order_items (
        id, recipient_phone, quantity,
        wholesale_bundles ( network, data_mb )
      )
    `,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    console.error("[dispatch wholesale]", error);
    return;
  }

  type ItemRow = {
    id: string;
    recipient_phone: string;
    quantity: number;
    wholesale_bundles:
      | { network: SupplierNetworkSlug; data_mb: number }
      | { network: SupplierNetworkSlug; data_mb: number }[]
      | null;
  };
  const row = order as {
    id: string;
    reference: string;
    status: string;
    supplier_reference: string | null;
    wholesale_order_items: ItemRow[];
  };

  if (row.supplier_reference) return;
  if (!["queued", "paid", "processing"].includes(row.status)) return;

  const items = (row.wholesale_order_items ?? []).map((it) => {
    const wb = Array.isArray(it.wholesale_bundles) ? it.wholesale_bundles[0] : it.wholesale_bundles;
    return { itemId: it.id, phone: it.recipient_phone, quantity: it.quantity, wb };
  });

  const byNetwork = new Map<SupplierNetworkSlug, typeof items>();
  for (const it of items) {
    if (!it.wb) continue;
    const list = byNetwork.get(it.wb.network) ?? [];
    list.push(it);
    byNetwork.set(it.wb.network, list);
  }

  if (byNetwork.size === 0) {
    await service
      .from("wholesale_orders")
      .update({
        supplier_status: "failed",
        supplier_error: "No items with mapped network",
      })
      .eq("id", row.id);
    return;
  }

  interface Submission {
    network: SupplierNetworkSlug;
    supplierId: string;
    ok: boolean;
    manual?: boolean;
    reference?: string;
    error?: string;
  }
  const submissions: Submission[] = [];
  const suppliersUsed = new Set<string>();
  let anyAccepted = false;
  let anyFailed = false;
  let anyManual = false;

  for (const [network, groupItems] of byNetwork.entries()) {
    const supplier: SupplierClient = await getResolvedSupplierForNetwork(network);
    suppliersUsed.add(supplier.id);

    // Expand quantities (each unit is a separate MSISDN delivery)
    const recipients: Array<{ msisdn: string; volumeMb: number }> = [];
    for (const it of groupItems) {
      if (!it.wb) continue;
      for (let q = 0; q < it.quantity; q++) {
        recipients.push({ msisdn: it.phone, volumeMb: it.wb.data_mb });
      }
    }

    const result = await supplier.submitBulk({
      network,
      recipients,
      reference: `${row.reference}-${network}`,
      scope: "wholesale_order",
    });

    if (result.manual) {
      anyManual = true;
      submissions.push({ network, supplierId: supplier.id, ok: true, manual: true });
      for (const it of groupItems) {
        await service
          .from("wholesale_order_items")
          .update({
            supplier_status: "awaiting_manual",
            supplier_error: null,
          })
          .eq("id", it.itemId);
      }
      continue;
    }

    if (!result.ok) {
      anyFailed = true;
      submissions.push({ network, supplierId: supplier.id, ok: false, error: result.error });
      for (const it of groupItems) {
        await service
          .from("wholesale_order_items")
          .update({
            supplier_status: "failed",
            supplier_error: (result.error ?? "Unknown supplier error").slice(0, 500),
          })
          .eq("id", it.itemId);
      }
      continue;
    }

    anyAccepted = true;
    submissions.push({
      network,
      supplierId: supplier.id,
      ok: true,
      reference: result.reference,
    });

    // Map supplier `orders` rows back to our items. Recipients were expanded by
    // quantity so we assign sequentially. If the supplier didn't return per-row
    // codes, we still flag the items as accepted.
    const supplierOrders = result.orders ?? [];
    let idx = 0;
    for (const it of groupItems) {
      const slice = supplierOrders.slice(idx, idx + it.quantity);
      idx += it.quantity;
      await service
        .from("wholesale_order_items")
        .update({
          supplier_order_code: slice[0]?.order_code ?? null,
          supplier_status: slice[0]?.status ?? result.status ?? "accepted",
          supplier_response: slice.length > 0 ? (slice as unknown as object) : null,
          supplier_error: null,
        })
        .eq("id", it.itemId);
    }
  }

  const supplierLabel = Array.from(suppliersUsed).join(",");
  const aggregateRef = submissions
    .filter((s) => s.reference)
    .map((s) => `${s.network}:${s.reference}`)
    .join(",");

  let parentStatus: string;
  if (anyAccepted && !anyFailed && !anyManual) parentStatus = "processing";
  else if (!anyAccepted && anyManual && !anyFailed) parentStatus = "queued"; // fully manual
  else if (anyAccepted || anyManual) parentStatus = "processing"; // partial automation
  else parentStatus = "failed";

  let aggregateStatus: string;
  if (anyAccepted && !anyFailed && !anyManual) aggregateStatus = "accepted";
  else if (!anyAccepted && anyManual && !anyFailed) aggregateStatus = "awaiting_manual";
  else if (anyFailed && (anyAccepted || anyManual)) aggregateStatus = "partial";
  else aggregateStatus = "failed";

  await service
    .from("wholesale_orders")
    .update({
      status: parentStatus,
      supplier: supplierLabel || null,
      supplier_reference: aggregateRef || null,
      supplier_status: aggregateStatus,
      supplier_response: submissions as unknown as object,
      supplier_submitted_at: new Date().toISOString(),
      supplier_error: anyFailed
        ? submissions
            .filter((s) => !s.ok)
            .map((s) => `${s.network} (${s.supplierId}): ${s.error}`)
            .join("; ")
            .slice(0, 500)
        : null,
    })
    .eq("id", row.id);
}

/** Resolve fulfilment of items returned by a supplier webhook batch. */
export async function resolveSupplierItemsProcessed(args: {
  supplierReference: string;
  orderCodes: string[];
  status: "PROCESSED" | "PARTIALLY_PROCESSED" | "FAILED" | string;
  rawPayload?: unknown;
}): Promise<{ customerOrdersFulfilled: number; wholesaleItemsFulfilled: number }> {
  if (!hasSupabaseConfig()) {
    return { customerOrdersFulfilled: 0, wholesaleItemsFulfilled: 0 };
  }
  const service = createServiceClient();
  const now = new Date().toISOString();
  const isFulfilled = args.status !== "FAILED";

  let customerOrdersFulfilled = 0;
  let wholesaleItemsFulfilled = 0;

  if (args.orderCodes.length > 0) {
    const { data: customerHits } = await service
      .from("orders")
      .update({
        status: isFulfilled ? "fulfilled" : "failed",
        supplier_status: args.status,
        supplier_response: (args.rawPayload as object | undefined) ?? null,
        fulfilled_at: isFulfilled ? now : null,
      })
      .in("supplier_order_code", args.orderCodes)
      .select("id");
    const customerIds = ((customerHits as unknown as { id: string }[] | null) ?? []).map(
      (r) => r.id,
    );
    customerOrdersFulfilled = customerIds.length;

    const { data: itemHits } = await service
      .from("wholesale_order_items")
      .update({
        status: isFulfilled ? "fulfilled" : "failed",
        supplier_status: args.status,
        supplier_response: (args.rawPayload as object | undefined) ?? null,
        supplier_fulfilled_at: isFulfilled ? now : null,
      })
      .in("supplier_order_code", args.orderCodes)
      .select("id, wholesale_order_id");
    const wholesaleItemIds = ((itemHits as unknown as { id: string }[] | null) ?? []).map(
      (r) => r.id,
    );
    wholesaleItemsFulfilled = wholesaleItemIds.length;

    const parentIds = Array.from(
      new Set(
        ((itemHits as unknown as { wholesale_order_id: string }[] | null) ?? []).map(
          (i) => i.wholesale_order_id,
        ),
      ),
    );
    for (const parentId of parentIds) {
      const { data: itemStatuses } = await service
        .from("wholesale_order_items")
        .select("status")
        .eq("wholesale_order_id", parentId);
      const rows = (itemStatuses ?? []) as { status: string }[];
      const allDone = rows.length > 0 && rows.every((r) => r.status === "fulfilled");
      const anyFailed = rows.some((r) => r.status === "failed");
      if (allDone) {
        await service
          .from("wholesale_orders")
          .update({ status: "fulfilled", fulfilled_at: now })
          .eq("id", parentId);
        await fireVendorWebhookForWholesaleOrder(parentId, "order.fulfilled");
        after(() => notifyVendorWholesaleFulfilled(parentId));
      } else if (anyFailed && rows.every((r) => ["fulfilled", "failed"].includes(r.status))) {
        await service
          .from("wholesale_orders")
          .update({ status: "failed" })
          .eq("id", parentId);
        await fireVendorWebhookForWholesaleOrder(parentId, "order.failed");
      }
    }

    if (isFulfilled) {
      for (const id of customerIds) after(() => tryCreditReferralForCustomerOrder(id));
      for (const id of wholesaleItemIds) {
        after(() => tryCreditReferralForWholesaleItem(id));
        after(() => notifyWholesaleItemDelivered(id));
      }
    }
  }

  return { customerOrdersFulfilled, wholesaleItemsFulfilled };
}

/** Apply Success Biz Hub (and similar) webhooks that key off supplier reference / order id. */
export async function resolveSupplierDeliveryByReference(args: {
  supplierReference: string;
  supplierOrderId?: string | null;
  outcome: "fulfilled" | "failed";
  supplierStatus: string;
  rawPayload?: unknown;
}): Promise<{ customerOrdersFulfilled: number; wholesaleItemsFulfilled: number }> {
  if (!hasSupabaseConfig()) {
    return { customerOrdersFulfilled: 0, wholesaleItemsFulfilled: 0 };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  const isFulfilled = args.outcome === "fulfilled";
  const refs = [args.supplierReference, args.supplierOrderId].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  const customerIds = new Set<string>();
  const wholesaleItemIds = new Set<string>();

  for (const ref of refs) {
    const customerPatch = {
      status: isFulfilled ? "fulfilled" : "failed",
      supplier_status: args.supplierStatus,
      supplier_response: (args.rawPayload as object | undefined) ?? null,
      fulfilled_at: isFulfilled ? now : null,
    };

    const [byRef, byCode] = await Promise.all([
      service.from("orders").update(customerPatch).eq("supplier_reference", ref).select("id"),
      service.from("orders").update(customerPatch).eq("supplier_order_code", ref).select("id"),
    ]);
    for (const row of (byRef.data as { id: string }[] | null) ?? []) customerIds.add(row.id);
    for (const row of (byCode.data as { id: string }[] | null) ?? []) customerIds.add(row.id);

    const itemPatch = {
      status: isFulfilled ? "fulfilled" : "failed",
      supplier_status: args.supplierStatus,
      supplier_response: (args.rawPayload as object | undefined) ?? null,
      supplier_fulfilled_at: isFulfilled ? now : null,
    };
    const { data: itemHits } = await service
      .from("wholesale_order_items")
      .update(itemPatch)
      .eq("supplier_order_code", ref)
      .select("id, wholesale_order_id");
    for (const row of (itemHits as unknown as { id: string }[] | null) ?? []) {
      wholesaleItemIds.add(row.id);
    }

    const parentIds = Array.from(
      new Set(
        ((itemHits as unknown as { wholesale_order_id: string }[] | null) ?? []).map(
          (i) => i.wholesale_order_id,
        ),
      ),
    );
    for (const parentId of parentIds) {
      const { data: itemStatuses } = await service
        .from("wholesale_order_items")
        .select("status")
        .eq("wholesale_order_id", parentId);
      const rows = (itemStatuses ?? []) as { status: string }[];
      const allDone = rows.length > 0 && rows.every((r) => r.status === "fulfilled");
      const anyFailed = rows.some((r) => r.status === "failed");
      if (allDone) {
        await service
          .from("wholesale_orders")
          .update({ status: "fulfilled", fulfilled_at: now })
          .eq("id", parentId);
        await fireVendorWebhookForWholesaleOrder(parentId, "order.fulfilled");
        after(() => notifyVendorWholesaleFulfilled(parentId));
      } else if (anyFailed && rows.every((r) => ["fulfilled", "failed"].includes(r.status))) {
        await service
          .from("wholesale_orders")
          .update({ status: "failed" })
          .eq("id", parentId);
        await fireVendorWebhookForWholesaleOrder(parentId, "order.failed");
      }
    }

    const { data: wholesaleByRef } = await service
      .from("wholesale_orders")
      .update({
        status: isFulfilled ? "fulfilled" : "failed",
        supplier_status: args.supplierStatus,
        supplier_response: (args.rawPayload as object | undefined) ?? null,
        fulfilled_at: isFulfilled ? now : null,
      })
      .ilike("supplier_reference", `%${ref}%`)
      .select("id");
    if ((wholesaleByRef as unknown as { id: string }[] | null)?.length) {
      for (const o of wholesaleByRef as { id: string }[]) {
        await fireVendorWebhookForWholesaleOrder(
          o.id,
          isFulfilled ? "order.fulfilled" : "order.failed",
        );
        if (isFulfilled) after(() => notifyVendorWholesaleFulfilled(o.id));
      }
    }
  }

  if (isFulfilled) {
    for (const id of customerIds) after(() => tryCreditReferralForCustomerOrder(id));
    for (const id of wholesaleItemIds) {
      after(() => tryCreditReferralForWholesaleItem(id));
      after(() => notifyWholesaleItemDelivered(id));
    }
  }

  return {
    customerOrdersFulfilled: customerIds.size,
    wholesaleItemsFulfilled: wholesaleItemIds.size,
  };
}

async function fireVendorWebhookForWholesaleOrder(
  wholesaleOrderId: string,
  event: "order.fulfilled" | "order.failed",
): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const service = createServiceClient();
  const { data } = await service
    .from("wholesale_orders")
    .select(
      `
      id, reference, vendor_id, status, total_amount, item_count, created_at, fulfilled_at,
      wholesale_order_items (
        recipient_phone, quantity, unit_price, line_total, status, supplier_status,
        wholesale_bundles ( sku, name, network, data_mb )
      )
    `,
    )
    .eq("id", wholesaleOrderId)
    .maybeSingle();

  if (!data) return;

  type Item = {
    recipient_phone: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    status: string;
    supplier_status: string | null;
    wholesale_bundles:
      | { sku: string; name: string; network: string; data_mb: number }
      | { sku: string; name: string; network: string; data_mb: number }[]
      | null;
  };
  type Row = {
    id: string;
    reference: string;
    vendor_id: string;
    status: string;
    total_amount: number;
    item_count: number;
    created_at: string;
    fulfilled_at: string | null;
    wholesale_order_items: Item[];
  };
  const o = data as Row;

  await deliverVendorWebhook({
    vendorId: o.vendor_id,
    event,
    reference: o.reference,
    data: {
      order_id: o.id,
      reference: o.reference,
      status: o.status,
      total: Number(o.total_amount),
      item_count: o.item_count,
      created_at: o.created_at,
      fulfilled_at: o.fulfilled_at,
      items: (o.wholesale_order_items ?? []).map((it) => {
        const b = Array.isArray(it.wholesale_bundles)
          ? it.wholesale_bundles[0]
          : it.wholesale_bundles;
        return {
          recipient_phone: it.recipient_phone,
          quantity: it.quantity,
          line_total: Number(it.line_total),
          status: it.status,
          bundle: b
            ? { sku: b.sku, name: b.name, network: b.network, data_mb: b.data_mb }
            : null,
        };
      }),
    },
  });
}
