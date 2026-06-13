import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { finalizePaystackCustomerOrder } from "@/lib/payments/customer-order-paystack";
import { markSetupPaymentPaid } from "@/lib/payments/setup-fee";
import { markWalletTopupPaid } from "@/lib/payments/wallet";
import { markWholesaleOrderPaid } from "@/lib/payments/wholesale-order";
import { smsWalletTopup } from "@/lib/notifications/sms";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const signature = request.headers.get("x-paystack-signature");
  const body = await request.text();

  const hash = crypto.createHmac("sha512", secret).update(body).digest("hex");
  if (hash !== signature) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(body) as {
    event: string;
    data: {
      reference: string;
      status: string;
      amount: number;
      metadata?: Record<string, string>;
    };
  };

  if (!hasSupabaseConfig()) {
    return NextResponse.json({ received: true, note: "DB not configured" });
  }

  if (event.event === "charge.success") {
    const meta = event.data.metadata ?? {};
    if (meta.type === "vendor_setup") {
      await markSetupPaymentPaid(event.data.reference, event.data.reference);
      return NextResponse.json({ received: true });
    }

    if (meta.type === "wholesale_order") {
      await markWholesaleOrderPaid(event.data.reference, event.data.reference);
      return NextResponse.json({ received: true });
    }

    if (meta.type === "wallet_topup") {
      const topup = await markWalletTopupPaid(event.data.reference, event.data.reference);
      if (topup && topup.notifyPhone) {
        after(() =>
          smsWalletTopup({
            phone: topup.notifyPhone!,
            amount: topup.amount,
            reference: topup.reference,
            context: { vendor_id: topup.vendorId },
          }),
        );
      }
      return NextResponse.json({ received: true });
    }

    await finalizePaystackCustomerOrder(event.data);
  }

  return NextResponse.json({ received: true });
}
