import { NextResponse } from "next/server";
import { z } from "zod";
import { getVendorApiContext, isVendorApiError } from "@/lib/auth/vendor-api";
import {
  createWalletTopup,
  initializeWalletTopupPaystack,
} from "@/lib/payments/wallet";
import { applyPaystackFee, getPaystackFeePercent } from "@/lib/data/platform-config";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  amount: z.number().min(5).max(50000),
});

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ctx = await getVendorApiContext();
  if (isVendorApiError(ctx)) return ctx;

  try {
    const { amount } = schema.parse(await request.json());

    // Agent bears the Paystack fee: credit `amount`, charge `amount + fee`.
    const feePercent = await getPaystackFeePercent();
    const { base, fee, gross } = applyPaystackFee(amount, feePercent);

    // Store the credit (base) amount — that is what lands in the wallet.
    const topup = await createWalletTopup(ctx.vendorId, base);

    const authUrl = await initializeWalletTopupPaystack({
      email: ctx.email ?? `vendor@dcselite.com`,
      vendorId: ctx.vendorId,
      reference: topup.reference,
      amount: gross,
    });

    if (!authUrl) {
      return NextResponse.json(
        { error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY to enable top-ups." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      authorizationUrl: authUrl,
      reference: topup.reference,
      amount: base,
      fee,
      gross,
      feePercent,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Amount must be between ₵5 and ₵50,000" }, { status: 400 });
    }
    console.error("[wallet_topup]", e);
    return NextResponse.json({ error: "Top-up failed" }, { status: 500 });
  }
}
