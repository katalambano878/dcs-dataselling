import { NextResponse } from "next/server";

import { reconcilePendingWalletTopups } from "@/lib/payments/wallet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target — backstop for missed Paystack webhooks on wallet top-ups.
 *
 * Verifies recent pending top-ups against Paystack and credits any that
 * actually succeeded (common with MoMo charges that never redirect back).
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`; we also accept ?secret=.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    const url = new URL(req.url);
    const provided = auth?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("secret") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await reconcilePendingWalletTopups();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Reconcile failed" },
      { status: 502 },
    );
  }
}
