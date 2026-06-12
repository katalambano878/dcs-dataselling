import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { tierUpdatesFor } from "@/lib/vendor/tiers";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  status: z.enum(["pending", "approved", "suspended", "rejected"]).optional(),
  featured: z.boolean().optional(),
  verified: z.boolean().optional(),
  tier: z.enum(["starter", "verified", "pro", "express"]).optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { id } = await params;
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (
    body.status === undefined &&
    body.featured === undefined &&
    body.verified === undefined &&
    body.tier === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status !== undefined) updates.status = body.status;
  if (body.featured !== undefined) updates.featured = body.featured;
  if (body.verified !== undefined) updates.verified = body.verified;
  if (body.status === "approved") updates.verified = true;
  if (body.tier !== undefined) {
    const settings = await getAgentTierSettings();
    Object.assign(updates, tierUpdatesFor(body.tier, true, settings));
  }

  const service = createServiceClient();
  const { error } = await service.from("vendors").update(updates).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
