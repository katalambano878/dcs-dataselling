import { NextResponse } from "next/server";

import { isRailwayExternalConfigured } from "@/lib/suppliers/railway-external";
import { syncPendingRailwayOrders } from "@/lib/suppliers/railway-poll";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron target — keeps Railway supplier order statuses in sync.
 *
 * Vercel sends a GET request with `Authorization: Bearer <CRON_SECRET>`.
 * We accept that, or an explicit `?secret=` match, so the endpoint can also
 * be triggered manually for diagnostics.
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

  if (!isRailwayExternalConfigured()) {
    return NextResponse.json({ ok: true, skipped: "RAILWAY_EXTERNAL_API_KEY not set" });
  }

  try {
    const result = await syncPendingRailwayOrders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Poll failed" },
      { status: 502 },
    );
  }
}
