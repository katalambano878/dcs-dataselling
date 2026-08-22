import { NextResponse } from "next/server";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { isAdaayaConfigured } from "@/lib/suppliers/adaaya";
import { syncPendingAdaayaOrders } from "@/lib/suppliers/adaaya-poll";

export const dynamic = "force-dynamic";

/** Admin-triggered Adaaya status sync. */
export async function POST() {
  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isAdaayaConfigured()) {
    return NextResponse.json(
      { error: "ADAAYA_API_KEY / ADAAYA_API_SECRET not set" },
      { status: 503 },
    );
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
