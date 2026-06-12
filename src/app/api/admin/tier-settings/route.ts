import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { getAgentTierSettings, saveAgentTierSettings } from "@/lib/data/tier-settings";
import { normalizeAgentTierSettings } from "@/lib/vendor/tiers";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const tierPricingSchema = z.object({
  label: z.string().min(1).max(40),
  description: z.string().max(200),
  commissionRate: z.number().min(0).max(50),
  rewardRate: z.number().min(0).max(1),
  minWithdrawal: z.number().min(1).max(100000),
});

const promotionSchema = z.object({
  minFulfilledOrders: z.number().int().min(0).max(1_000_000),
  minSuccessRate: z.number().min(0).max(100),
  minDailyOrders: z.number().int().min(0).max(100_000),
});

const schema = z.object({
  tiers: z.object({
    starter: tierPricingSchema,
    verified: tierPricingSchema,
    pro: tierPricingSchema,
    express: tierPricingSchema,
  }),
  promotion: z.object({
    verified: promotionSchema,
    pro: promotionSchema,
  }),
});

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ settings: normalizeAgentTierSettings(null) });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const settings = await getAgentTierSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid tier settings" }, { status: 400 });
  }

  const settings = normalizeAgentTierSettings(body);
  await saveAgentTierSettings(settings);

  return NextResponse.json({ ok: true, settings });
}
