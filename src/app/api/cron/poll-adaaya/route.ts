import { NextResponse } from "next/server";

import { isAdaayaConfigured } from "@/lib/suppliers/adaaya";
import { syncPendingAdaayaOrders } from "@/lib/suppliers/adaaya-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Cron / manual trigger — sync Adaaya AT transaction statuses.
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

  if (!isAdaayaConfigured()) {
    return NextResponse.json({ ok: true, skipped: "ADAAYA_API_KEY / SECRET not set" });
  }

  try {
    const result = await syncPendingAdaayaOrders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Poll failed" },
      { status: 502 },
    );
  }
}
