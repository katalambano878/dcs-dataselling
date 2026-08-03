import { NextResponse } from "next/server";
import {
  getPaidSetupPaymentForUser,
  getVendorStoreSetupFeeGhs,
  linkSetupPaymentToVendor,
} from "@/lib/payments/setup-fee";
import { createClient, createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import {
  attachReferralOnSignup,
  ensureVendorReferralCode,
} from "@/lib/referrals/vendor-referral";
import { createVendorStore } from "@/lib/vendor/create-store-core";
import { tierUpdatesFor } from "@/lib/vendor/tiers";

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
    const fd = await request.formData();
    const businessName = String(fd.get("businessName") ?? "").trim();
    const slug = String(fd.get("slug") ?? "").trim();
    const emoji = String(fd.get("emoji") ?? "store");
    const themeColor = String(fd.get("themeColor") ?? "#0A2E5D");
    const whatsapp = String(fd.get("whatsapp") ?? "");
    const momoNumber = String(fd.get("momoNumber") ?? "");
    const momoNetwork = String(fd.get("momoNetwork") ?? "mtn") as "mtn" | "telecel" | "at";
    const referralCode = String(fd.get("referralCode") ?? "");
    const setupFeeReference = String(fd.get("setupFeeReference") ?? "").trim();

    if (businessName.length < 3 || slug.length < 3) {
      return NextResponse.json({ error: "Invalid store details" }, { status: 400 });
    }

    // When the admin has turned the setup fee off, store creation is free —
    // no payment record is required or linked.
    const feeRequired = (await getVendorStoreSetupFeeGhs()) > 0;

    let setupPayment: Awaited<ReturnType<typeof getPaidSetupPaymentForUser>> = null;
    if (feeRequired) {
      if (!setupFeeReference) {
        return NextResponse.json(
          { error: "Store setup fee payment is required before submitting" },
          { status: 400 },
        );
      }

      setupPayment = await getPaidSetupPaymentForUser(
        setupFeeReference,
        user.id,
        slug.toLowerCase(),
      );
      if (!setupPayment) {
        return NextResponse.json(
          { error: "Setup fee not paid or does not match this store handle" },
          { status: 402 },
        );
      }
    }

    const created = await createVendorStore({
      userId: user.id,
      businessName,
      slug,
      emoji,
      themeColor,
      whatsapp: whatsapp || null,
    });

    if (!created.ok) {
      const status = created.code === "slug_taken" ? 409 : 400;
      return NextResponse.json({ error: created.error }, { status });
    }

    const vendorId = created.vendorId;

    const service = createServiceClient();
    const tierSettings = await getAgentTierSettings();

    await service
      .from("vendors")
      .update({
        momo_number: momoNumber,
        momo_network: momoNetwork,
        kyc_status: "verified",
        status: "approved",
        verified: true,
        // No fee charged: mark the store activated so the dashboard gate passes.
        ...(feeRequired
          ? {}
          : { setup_fee_paid_at: new Date().toISOString(), setup_fee_reference: "WAIVED" }),
        ...tierUpdatesFor("starter", false, tierSettings),
      })
      .eq("id", vendorId);

    if (setupPayment) {
      await linkSetupPaymentToVendor(setupPayment.id, vendorId as string, setupFeeReference);
    }

    await ensureVendorReferralCode(vendorId as string);
    if (referralCode.trim()) {
      const refResult = await attachReferralOnSignup(vendorId as string, referralCode);
      if (!refResult.ok) {
        console.warn("[create-store] referral:", refResult.error);
      }
    }

    return NextResponse.json({ vendorId, ok: true });
  } catch (e) {
    console.error("[create-store]", e);
    return NextResponse.json({ error: "Submission failed" }, { status: 500 });
  }
}
