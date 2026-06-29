import { NextResponse } from "next/server";
import { getConsoleApiContext, isConsoleApiError } from "@/lib/auth/console-api";
import { fetchConsoleDashboardStats } from "@/lib/console/stats";
import { fetchConsolePricingForVendor } from "@/lib/console/pricing";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  const [stats, pricing] = await Promise.all([
    fetchConsoleDashboardStats(ctx.vendorId),
    fetchConsolePricingForVendor(ctx.vendorId),
  ]);

  return NextResponse.json({
    stats: stats ?? {
      balanceMb: 0,
      totalSends: 0,
      sentTodayCount: 0,
      sentTodayMb: 0,
      enabled: false,
    },
    pricing,
  });
}
