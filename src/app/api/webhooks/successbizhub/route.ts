import { NextResponse, after } from "next/server";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { smsOrderFulfilled } from "@/lib/notifications/sms";
import { formatDataAmount } from "@/lib/format";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";
import { creditVendorReward } from "@/lib/vendor/extras";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { getTierConfigFromSettings } from "@/lib/vendor/tiers";
import type { VendorTier } from "@/types";
import {
  logWebhookEvent,
  mapSuccessBizStatus,
} from "@/lib/suppliers/successbizhub";
import { resolveSupplierDeliveryByReference } from "@/lib/suppliers/dispatch";

/**
 * Success Biz Hub order status webhook.
 * Docs: https://documenter.getpostman.com/view/36783125/2sBXcLfxJU
 *
 * Accepts payloads with at least `reference` or `orderId` and a `status` field.
 * Configure webhook URL on your API key or pass webhookUrl per order.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  let event: {
    reference?: string;
    orderId?: string;
    status?: string;
    order?: { reference?: string; orderId?: string; status?: string };
    success?: boolean;
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    await logWebhookEvent({ ok: false, error: "Invalid JSON", payload: rawBody.slice(0, 500) });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const reference = event.reference ?? event.order?.reference;
  const orderId = event.orderId ?? event.order?.orderId;
  const statusRaw = event.status ?? event.order?.status ?? "";

  if (!reference && !orderId) {
    await logWebhookEvent({ ok: false, error: "Missing reference/orderId", payload: event });
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const mapped = mapSuccessBizStatus(statusRaw);
  if (mapped === "processing") {
    await logWebhookEvent({
      ok: true,
      supplierReference: reference ?? orderId ?? null,
      payload: event,
      error: `Ignored interim status: ${statusRaw}`,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const result = await resolveSupplierDeliveryByReference({
    supplierReference: reference ?? orderId ?? "",
    supplierOrderId: orderId ?? null,
    outcome: mapped,
    supplierStatus: statusRaw,
    rawPayload: event,
  });

  await logWebhookEvent({
    ok: true,
    supplierReference: reference ?? orderId ?? null,
    payload: event,
    error:
      result.customerOrdersFulfilled + result.wholesaleItemsFulfilled === 0
        ? "No matching orders updated"
        : null,
  });

  if (
    hasSupabaseConfig() &&
    mapped === "fulfilled" &&
    result.customerOrdersFulfilled > 0 &&
    orderId
  ) {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("orders")
      .select(
        `
        id, reference, recipient_phone, vendor_id, amount, platform_fee, reward_credited_at, bundle_id,
        vendors ( tier )
      `,
      )
      .eq("supplier_order_code", orderId);

    type FulfilledRow = {
      id: string;
      reference: string;
      recipient_phone: string;
      vendor_id: string;
      amount: number | string;
      platform_fee: number | string;
      reward_credited_at: string | null;
      bundle_id: string;
      vendors: { tier: VendorTier | null } | { tier: VendorTier | null }[] | null;
    };

    const settings = await getAgentTierSettings();
    for (const r of (rows ?? []) as FulfilledRow[]) {
      if (!r.reward_credited_at && r.vendor_id) {
        const tier = (Array.isArray(r.vendors) ? r.vendors[0]?.tier : r.vendors?.tier) ?? "starter";
        const rewardRate = getTierConfigFromSettings(tier, settings).rewardRate;
        const markup = Math.max(0, Number(r.amount) - Number(r.platform_fee)) * rewardRate;
        if (markup > 0) {
          await creditVendorReward(r.vendor_id, +markup.toFixed(2), r.reference);
          await service
            .from("orders")
            .update({ reward_credited_at: new Date().toISOString() })
            .eq("id", r.id);
        }
      }
      const bundle = await fetchStorefrontOrderBundle(service, r.bundle_id);
      const bundleLabel = bundle
        ? `${formatDataAmount(bundle.data_mb)} ${bundle.name}`
        : "data";
      after(() =>
        smsOrderFulfilled({
          phone: r.recipient_phone,
          reference: r.reference,
          bundleLabel,
        }),
      );
    }
  }

  return NextResponse.json({
    received: true,
    customer_orders_updated: result.customerOrdersFulfilled,
    wholesale_items_updated: result.wholesaleItemsFulfilled,
  });
}
