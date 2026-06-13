import "server-only";

import { after } from "next/server";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";
import { dispatchCustomerOrderToSupplier } from "@/lib/suppliers/dispatch";
import { smsOrderPaymentReceived } from "@/lib/notifications/sms";
import { formatDataAmount } from "@/lib/format";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

type PaystackCharge = {
  reference: string;
  status: string;
  amount: number;
};

/**
 * Mark a pending storefront order paid after Paystack confirms payment, then
 * queue supplier dispatch. Idempotent when the order is already past pending.
 */
export async function finalizePaystackCustomerOrder(charge: PaystackCharge): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  if (charge.status !== "success") return false;

  const service = createServiceClient();
  const { data: order } = await service
    .from("orders")
    .select("id, status, reference, recipient_phone, bundle_id")
    .eq("reference", charge.reference)
    .maybeSingle();

  const o = order as {
    id: string;
    status: string;
    reference: string;
    recipient_phone: string;
    bundle_id: string;
  } | null;

  if (!o) return false;
  if (o.status !== "pending") return false;

  const bundle = await fetchStorefrontOrderBundle(service, o.bundle_id);
  const bundleLabel = bundle
    ? `${formatDataAmount(bundle.data_mb)} ${bundle.name}`
    : "data";

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await service
    .from("orders")
    .update({
      status: "paid",
      paid_at: nowIso,
      payment_reference: charge.reference,
    })
    .eq("id", o.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updateErr || !updated) return false;

  await service.from("transactions").insert({
    order_id: o.id,
    provider: "paystack",
    provider_reference: charge.reference,
    amount: charge.amount / 100,
    status: charge.status,
    raw_payload: charge,
  });

  await service.from("orders").update({ status: "queued" }).eq("id", o.id);

  after(() =>
    smsOrderPaymentReceived({
      phone: o.recipient_phone,
      reference: o.reference,
      bundleLabel,
    }),
  );

  after(() => dispatchCustomerOrderToSupplier(o.id));

  return true;
}

/** Fallback when the Paystack webhook is missed — e.g. customer lands on the receipt page. */
export async function verifyCustomerOrderWithPaystack(reference: string): Promise<boolean> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const payload = (await res.json()) as {
    status?: boolean;
    data?: PaystackCharge;
  };

  if (!payload.status || payload.data?.status !== "success") {
    return false;
  }

  return finalizePaystackCustomerOrder(payload.data!);
}
