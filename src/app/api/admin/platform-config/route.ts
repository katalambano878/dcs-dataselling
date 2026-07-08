import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { getPlatformConfig, savePlatformConfig } from "@/lib/data/platform-config";
import { normalizePlatformConfig } from "@/lib/platform/config-types";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const momoDirectSchema = z.object({
  enabled: z.boolean(),
  merchantNumbers: z.object({
    mtn: z.string().max(20),
    telecel: z.string().max(20),
    at: z.string().max(20),
  }),
  merchantName: z.string().max(80),
  smsForwarderSecret: z.string().max(200),
});

const schema = z.object({
  vendorSetupFeeEnabled: z.boolean().optional(),
  vendorSetupFeeGhs: z.number().min(1).max(100000).optional(),
  recipientOrderCooldownMinutes: z.number().min(1).max(3).optional(),
  referralRewardGhs: z.number().min(1).max(10000).optional(),
  paystackFeePercent: z.number().min(0).max(10).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(500).optional(),
  momoDirect: momoDirectSchema.optional(),
  supplierRouting: z
    .object({
      mtn: z.enum(["manual", "skanka5", "successbizhub", "railwayexternal", "ishare"]).optional(),
      telecel: z.enum(["manual", "skanka5", "successbizhub", "railwayexternal", "ishare"]).optional(),
      at: z.enum(["manual", "skanka5", "successbizhub", "railwayexternal", "ishare"]).optional(),
    })
    .optional(),
  contact: z
    .object({
      supportWhatsApp: z.string().max(40),
      whatsappChannelUrl: z.string().max(300),
    })
    .optional(),
});

export async function GET() {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const config = await getPlatformConfig();
  return NextResponse.json({ config });
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
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  // Merge with current settings so partial updates from older UIs don't wipe
  // newer fields (e.g. saving just vendorSetupFeeGhs preserves momoDirect).
  const current = await getPlatformConfig();
  const merged = normalizePlatformConfig({ ...current, ...body });

  await savePlatformConfig(merged);
  const config = await getPlatformConfig();
  return NextResponse.json({ ok: true, config });
}
