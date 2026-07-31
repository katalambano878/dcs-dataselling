import { NextResponse } from "next/server";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { isShopDcsConfigured } from "@/lib/suppliers/shopdcs";
import { syncPendingShopDcsOrders } from "@/lib/suppliers/shopdcs-poll";

export const dynamic = "force-dynamic";

/** Admin-triggered Shop DCS status sync. */
export async function POST() {
  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isShopDcsConfigured()) {
    return NextResponse.json({ error: "SHOP_DCS_API_KEY not set" }, { status: 503 });
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
