import { NextResponse } from "next/server";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { isRailwayExternalConfigured } from "@/lib/suppliers/railway-external";
import { syncPendingRailwayOrders } from "@/lib/suppliers/railway-poll";

export async function POST() {
  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isRailwayExternalConfigured()) {
    return NextResponse.json(
      {
        error:
          "Railway API not configured — set RAILWAY_EXTERNAL_API_KEY and RAILWAY_EXTERNAL_BASE_URL",
      },
      { status: 503 },
    );
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
