import { NextResponse } from "next/server";
import { z } from "zod";
import { getVendorApiContext, isVendorApiError } from "@/lib/auth/vendor-api";
import { fetchVendorRewards, requestRewardWithdrawal } from "@/lib/vendor/extras";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { getTierConfigFromSettings } from "@/lib/vendor/tiers";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { VendorTier } from "@/types";

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ balance: 0, withdrawals: [] });
  }

  const ctx = await getVendorApiContext();
  if (isVendorApiError(ctx)) return ctx;

  const data = await fetchVendorRewards(ctx.vendorId);
  return NextResponse.json(data);
}

const withdrawSchema = z.object({
  amount: z.number().positive().max(100000),
  momoNumber: z.string().min(10).max(20),
});

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ctx = await getVendorApiContext();
  if (isVendorApiError(ctx)) return ctx;

  try {
    const body = withdrawSchema.parse(await request.json());

    const service = createServiceClient();
    const { data: vendorRow } = await service
      .from("vendors")
      .select("tier")
      .eq("id", ctx.vendorId)
      .maybeSingle();
    const settings = await getAgentTierSettings();
    const minWithdrawal = getTierConfigFromSettings(
      (vendorRow as { tier?: VendorTier } | null)?.tier,
      settings,
    ).minWithdrawal;

    if (body.amount < minWithdrawal) {
      return NextResponse.json(
        { error: `Minimum withdrawal is ₵${minWithdrawal}` },
        { status: 400 },
      );
    }

    const result = await requestRewardWithdrawal(ctx.vendorId, body.amount, body.momoNumber);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid withdrawal amount" }, { status: 400 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Withdrawal failed" },
      { status: 400 },
    );
  }
}
