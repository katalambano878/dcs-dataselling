import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient, createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { ensureVendorReferralCode } from "@/lib/referrals/vendor-referral";
import { createVendorStore } from "@/lib/vendor/create-store-core";

/**
 * Create an API-only vendor account (developer API access, no public storefront).
 *
 * Reuses the existing `create_store` RPC to build the vendor row + wallet, then
 * flags it api_only and leaves it pending admin approval. The store setup fee is
 * waived, and the account is never listed publicly (kyc stays unverified and the
 * public RLS policy excludes api_only rows). API keys stay inactive until an
 * admin approves the account (status = 'approved').
 */

const schema = z.object({
  businessName: z.string().min(3, "Name must be at least 3 characters").max(60),
  slug: z.string().max(40).optional(),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json());
    const businessName = body.businessName.trim();

    const service = createServiceClient();

    // If this user already has a vendor account, don't create another one.
    const { data: existing } = await service
      .from("vendors")
      .select("id, api_only")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing) {
      const e = existing as { id: string; api_only: boolean | null };
      return NextResponse.json({ ok: true, vendorId: e.id, alreadyExists: true });
    }

    const base = slugify(body.slug?.trim() || businessName) || "api";
    const suffix = Math.random().toString(36).slice(2, 6);
    const slug = `${base}-${suffix}`.slice(0, 40);

    const created = await createVendorStore({
      userId: user.id,
      businessName,
      slug,
      emoji: "code",
      themeColor: "#0A2E5D",
      whatsapp: null,
    });

    if (!created.ok) {
      console.error("[api-access] createVendorStore", created);
      return NextResponse.json({ error: created.error }, { status: 400 });
    }

    const vendorId = created.vendorId;

    // Flag as API-only, keep it unlisted and pending approval. We do NOT set
    // setup_fee_paid_at (fee waived) or kyc verified (so it never lists publicly).
    const { error: updErr } = await service
      .from("vendors")
      .update({
        api_only: true,
        status: "pending",
        verified: false,
        kyc_status: "not_started",
      })
      .eq("id", vendorId as string);
    if (updErr) {
      console.error("[api-access] flag api_only", updErr);
      return NextResponse.json({ error: "Could not finalize API account" }, { status: 500 });
    }

    await ensureVendorReferralCode(vendorId as string);

    return NextResponse.json({ ok: true, vendorId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.issues[0]?.message ?? "Invalid details" },
        { status: 400 },
      );
    }
    console.error("[api-access]", e);
    return NextResponse.json({ error: "Could not create API account" }, { status: 500 });
  }
}
