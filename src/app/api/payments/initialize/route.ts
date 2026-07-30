import { NextResponse } from "next/server";
import { z } from "zod";
import { SITE } from "@/lib/constants";
import { getMomoDirectConfig } from "@/lib/data/platform-config";
import { generateMomoOrderReference } from "@/lib/payments/momo-direct";
import {
  assertRecipientsNotOnCooldown,
  normalizeRecipientPhone,
} from "@/lib/orders/recipient-cooldown";
import { createClient, createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  bundleId: z.string().uuid(),
  recipientPhone: z.string().min(10).max(20),
  provider: z.enum(["paystack", "momo_direct"]).default("paystack"),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());

    if (!hasSupabaseConfig()) {
      return NextResponse.json(
        { error: "Database not configured" },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const service = createServiceClient();

    const bundleQuery = await service
      .from("marketplace_bundles")
      .select("id, vendor_id, price, name")
      .eq("id", body.bundleId)
      .maybeSingle();

    const bundle = bundleQuery.data as { id: string; vendor_id: string; price: number; name: string } | null;
    if (bundleQuery.error || !bundle) {
      return NextResponse.json({ error: "Bundle not found" }, { status: 404 });
    }

    const vendorQuery = await service
      .from("vendors")
      .select("commission_rate")
      .eq("id", bundle.vendor_id)
      .maybeSingle();

    const phone = normalizeRecipientPhone(body.recipientPhone);
    if (!phone) {
      return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
    }

    const cooldown = await assertRecipientsNotOnCooldown([phone]);
    if (!cooldown.ok) {
      return NextResponse.json({ error: cooldown.message }, { status: 409 });
    }

    const vendor = vendorQuery.data as { commission_rate: number } | null;
    const commission = Number(vendor?.commission_rate ?? 8);
    const platformFee = +(Number(bundle.price) * (commission / 100)).toFixed(2);
    const vendorPayout = +(Number(bundle.price) - platformFee).toFixed(2);

    const { data: { user } } = await supabase.auth.getUser();

    // MoMo-direct gets a short, easy-to-type reference. Paystack keeps the
    // existing dated format that Paystack expects.
    const reference =
      body.provider === "momo_direct"
        ? generateMomoOrderReference()
        : `DCS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
            .toString(36)
            .slice(2, 8)
            .toUpperCase()}`;

    const initialStatus = body.provider === "momo_direct" ? "awaiting_momo" : "pending";

    const { data: order, error: orderErr } = await service
      .from("orders")
      .insert({
        reference,
        user_id: user?.id ?? null,
        vendor_id: bundle.vendor_id,
        bundle_id: bundle.id,
        recipient_phone: phone,
        amount: bundle.price,
        platform_fee: platformFee,
        vendor_payout: vendorPayout,
        status: initialStatus,
        payment_provider: body.provider,
      })
      .select("id, reference")
      .single();

    if (orderErr || !order) {
      console.error("[order_insert]", orderErr);
      return NextResponse.json({ error: "Could not create order" }, { status: 500 });
    }

    // MoMo-direct: no Paystack call, return merchant numbers + reference so the
    // checkout page can show the "Send GHS X to 02XXXXXXXX" instructions.
    if (body.provider === "momo_direct") {
      const momo = await getMomoDirectConfig();
      if (!momo.enabled) {
        return NextResponse.json(
          { error: "MoMo direct is currently disabled by the admin." },
          { status: 503 },
        );
      }
      return NextResponse.json({
        provider: "momo_direct",
        orderId: order.id,
        reference: order.reference,
        amount: Number(bundle.price),
        merchantNumbers: momo.merchantNumbers,
        merchantName: momo.merchantName,
      });
    }

    if (body.provider === "paystack" && process.env.PAYSTACK_SECRET_KEY) {
      const { fetchWithTimeout } = await import("@/lib/http/fetch-with-timeout");
      const res = await fetchWithTimeout("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: user?.email ?? `guest@${SITE.domain}`,
          amount: Math.round(Number(bundle.price) * 100),
          currency: "GHS",
          reference: order.reference,
          metadata: {
            order_id: order.id,
            bundle_id: bundle.id,
            recipient_phone: body.recipientPhone,
          },
          channels: ["mobile_money", "card"],
          callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/orders/${order.id}?ref=${order.reference}`,
        }),
      }, 15_000);
      const data = await res.json();
      if (data.status && data.data?.authorization_url) {
        return NextResponse.json({
          authorizationUrl: data.data.authorization_url,
          reference: order.reference,
          orderId: order.id,
        });
      }
    }

    return NextResponse.json(
      {
        error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY to enable payments.",
      },
      { status: 503 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[payments_initialize]", e);
    return NextResponse.json({ error: "Payment initialization failed" }, { status: 500 });
  }
}
