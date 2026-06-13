import { NextResponse, after } from "next/server";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { smsOrderFulfilled } from "@/lib/notifications/sms";
import { formatDataAmount } from "@/lib/format";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";
import { logWebhookEvent, verifyWebhookSignature } from "@/lib/suppliers/skanka5";
import { resolveSupplierItemsProcessed } from "@/lib/suppliers/dispatch";
import { creditVendorReward } from "@/lib/vendor/extras";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { getTierConfigFromSettings } from "@/lib/vendor/tiers";
import type { VendorTier } from "@/types";

/**
 * Skanka5 webhook receiver.
 *
 * Payload shape (grouped processed items):
 *   {
 *     "event": "order.items_processed",
 *     "reference": "ORDER-000123",
 *     "status": "PROCESSED" | "PARTIALLY_PROCESSED" | "FULLY_PROCESSED" | "FAILED",
 *     "items": [{ "order_code": "MTN-...", "msisdn": "...", "status": "..." }, ...]
 *   }
 *
 * Signature: X-Skanka5-Signature = HMAC-SHA256(rawBody, SKANKA5_WEBHOOK_SECRET)
 *
 * Diagnostic mode: set SKANKA5_ALLOW_UNSIGNED_WEBHOOKS=1 in env to *temporarily*
 * accept webhooks without signature verification. Every header Skanka5 sends is
 * still logged so you can locate the signing secret. NEVER leave this on in
 * production with real money flowing — anyone could spoof fulfilment.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-skanka5-signature");

  // Capture every header for diagnosis (useful when Skanka5 hides the secret
  // and you need to see what they actually sent).
  const allHeaders: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    allHeaders[key] = value;
  });

  const allowUnsigned = process.env.SKANKA5_ALLOW_UNSIGNED_WEBHOOKS === "1";
  const signatureValid = verifyWebhookSignature(rawBody, signature);

  if (!signatureValid && !allowUnsigned) {
    await logWebhookEvent({
      ok: false,
      error: "Invalid signature",
      payload: {
        signature_header: signature,
        all_headers: allHeaders,
        body_snippet: rawBody.slice(0, 500),
      },
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event?: string;
    reference?: string;
    status?: string;
    items?: Array<{ order_code?: string; msisdn?: string; status?: string }>;
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    await logWebhookEvent({
      ok: false,
      error: "Invalid JSON",
      payload: { body_snippet: rawBody.slice(0, 500), all_headers: allHeaders },
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (event.event !== "order.items_processed") {
    await logWebhookEvent({
      ok: true,
      payload: { event, all_headers: allHeaders, signature_valid: signatureValid },
      error: `Ignored event: ${event.event ?? "unknown"}`,
    });
    return NextResponse.json({ received: true, ignored: true });
  }

  const orderCodes = (event.items ?? [])
    .map((i) => i.order_code)
    .filter((c): c is string => typeof c === "string" && c.length > 0);

  if (orderCodes.length === 0) {
    await logWebhookEvent({
      ok: false,
      error: "No order_code in items",
      supplierReference: event.reference,
      payload: { event, all_headers: allHeaders, signature_valid: signatureValid },
    });
    return NextResponse.json({ received: true, processed: 0 });
  }

  const result = await resolveSupplierItemsProcessed({
    supplierReference: event.reference ?? "",
    orderCodes,
    status: event.status ?? "PROCESSED",
    rawPayload: event,
  });

  await logWebhookEvent({
    ok: true,
    supplierReference: event.reference,
    payload: {
      event,
      signature_valid: signatureValid,
      unsigned_mode: !signatureValid && allowUnsigned ? true : undefined,
    },
    error:
      result.customerOrdersFulfilled + result.wholesaleItemsFulfilled === 0
        ? "No matching orders updated"
        : null,
  });

  // For matched customer storefront orders that just transitioned to
  // `fulfilled`: (a) credit the vendor's reward balance at their current tier
  // reward rate, and (b) send the delivery SMS to the recipient.
  if (hasSupabaseConfig() && result.customerOrdersFulfilled > 0 && event.status !== "FAILED") {
    const service = createServiceClient();
    const { data: rows } = await service
      .from("orders")
      .select(
        `
        id, reference, recipient_phone, vendor_id, amount, platform_fee, reward_credited_at, bundle_id,
        vendors ( tier )
      `,
      )
      .in("supplier_order_code", orderCodes);

    type FulfilledRow = {
      id: string;
      reference: string;
      recipient_phone: string;
      vendor_id: string;
      amount: number | string;
      platform_fee: number | string;
      reward_credited_at: string | null;
      bundle_id: string;
      vendors:
        | { tier: VendorTier | null }
        | { tier: VendorTier | null }[]
        | null;
    };

    const settings = await getAgentTierSettings();

    for (const r of (rows ?? []) as FulfilledRow[]) {
      // Reward credit (idempotent: only if not yet credited)
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

      // Fulfilment SMS
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
    signature_valid: signatureValid,
  });
}
