import { NextResponse } from "next/server";

import { isShopDcsConfigured } from "@/lib/suppliers/shopdcs";
import { syncPendingShopDcsOrders } from "@/lib/suppliers/shopdcs-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron / manual trigger — sync Shop DCS Telecel order statuses.
 * Auth: Authorization: Bearer <CRON_SECRET> or ?secret=
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

  if (!isShopDcsConfigured()) {
    return NextResponse.json({ ok: true, skipped: "SHOP_DCS_API_KEY not set" });
  }

  try {
    const result = await syncPendingShopDcsOrders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Poll failed" },
      { status: 502 },
    );
  }
}
