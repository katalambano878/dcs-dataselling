import { NextResponse, after } from "next/server";
import crypto from "crypto";
import { finalizePaystackCustomerOrder } from "@/lib/payments/customer-order-paystack";
import { markSetupPaymentPaid } from "@/lib/payments/setup-fee";
import { markWalletTopupPaid } from "@/lib/payments/wallet";
import { markWholesaleOrderPaid } from "@/lib/payments/wholesale-order";
import { smsWalletTopup } from "@/lib/notifications/sms";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

function amountsMatch(expectedGhs: number | string, chargedPesewas: number): boolean {
  const expectedPesewas = Math.round(Number(expectedGhs) * 100);
  if (!Number.isFinite(expectedPesewas) || expectedPesewas <= 0) return false;
  if (!Number.isFinite(chargedPesewas)) return false;
  return Math.abs(chargedPesewas - expectedPesewas) <= 1;
}

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
    const service = createServiceClient();

    if (meta.type === "vendor_setup") {
      const { data: setup } = await service
        .from("vendor_setup_payments")
        .select("amount, status")
        .eq("reference", event.data.reference)
        .maybeSingle();
      const row = setup as { amount: number | string; status: string } | null;
      if (row?.status === "pending" && amountsMatch(row.amount, event.data.amount)) {
        await markSetupPaymentPaid(event.data.reference, event.data.reference);
      } else if (row?.status === "pending") {
        console.error(
          "[paystack] setup-fee amount mismatch",
          JSON.stringify({
            reference: event.data.reference,
            expectedGhs: row.amount,
            charged: event.data.amount,
          }),
        );
      }
      return NextResponse.json({ received: true });
    }

    if (meta.type === "wholesale_order") {
      // Legacy metadata path — wholesale checkout is wallet-debited today.
      await markWholesaleOrderPaid(event.data.reference, event.data.reference);
      return NextResponse.json({ received: true });
    }

    if (meta.type === "wallet_topup") {
      const { data: topupRow } = await service
        .from("wallet_topups")
        .select("amount, status")
        .eq("reference", event.data.reference)
        .maybeSingle();
      const row = topupRow as { amount: number | string; status: string } | null;
      if (!row || row.status !== "pending") {
        return NextResponse.json({ received: true });
      }
      if (!amountsMatch(row.amount, event.data.amount)) {
        console.error(
          "[paystack] wallet top-up amount mismatch",
          JSON.stringify({
            reference: event.data.reference,
            expectedGhs: row.amount,
            charged: event.data.amount,
          }),
        );
        return NextResponse.json({ received: true });
      }

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
