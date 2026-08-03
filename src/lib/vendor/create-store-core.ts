import "server-only";

import { getOrCreateVendorWallet } from "@/lib/payments/wallet";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export type CreateVendorStoreInput = {
  userId: string;
  businessName: string;
  slug: string;
  emoji?: string;
  themeColor?: string;
  whatsapp?: string | null;
};

export type CreateVendorStoreResult =
  | { ok: true; vendorId: string }
  | { ok: false; error: string; code: "slug_taken" | "already_vendor" | "not_found" };

/** Create a vendor row + wallet and promote the profile to vendor. */
export async function createVendorStore(
  input: CreateVendorStoreInput,
): Promise<CreateVendorStoreResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, error: "Database not configured", code: "not_found" };
  }

  const service = createServiceClient();
  const slug = input.slug.trim().toLowerCase();
  const businessName = input.businessName.trim();

  const { data: profile } = await service
    .from("profiles")
    .select("id")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile) {
    return { ok: false, error: "Account not found", code: "not_found" };
  }

  const { data: existingVendor } = await service
    .from("vendors")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (existingVendor) {
    return {
      ok: false,
      error: "You already have a store on this account",
      code: "already_vendor",
    };
  }

  const { data: slugTaken } = await service
    .from("vendors")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) {
    return {
      ok: false,
      error: "This store handle is already taken",
      code: "slug_taken",
    };
  }

  const { data: inserted, error: insErr } = await service
    .from("vendors")
    .insert({
      user_id: input.userId,
      slug,
      business_name: businessName,
      emoji: input.emoji?.trim() || "store",
      theme_color: input.themeColor?.trim() || "#0A2E5D",
      whatsapp_number: input.whatsapp?.trim() || null,
      status: "pending",
      verified: false,
      kyc_status: "not_started",
      tier: "starter",
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    const msg = insErr?.message ?? "";
    if (msg.includes("vendors_slug_key") || msg.toLowerCase().includes("duplicate")) {
      return {
        ok: false,
        error: "This store handle is already taken",
        code: "slug_taken",
      };
    }
    console.error("[createVendorStore] insert vendor", insErr);
    return { ok: false, error: "Could not create store", code: "not_found" };
  }

  const vendorId = (inserted as { id: string }).id;

  const { error: roleErr } = await service
    .from("profiles")
    .update({ role: "vendor" })
    .eq("id", input.userId);
  if (roleErr) {
    console.error("[createVendorStore] promote profile", roleErr);
    await service.from("vendors").delete().eq("id", vendorId);
    return { ok: false, error: "Could not finalize store account", code: "not_found" };
  }

  await getOrCreateVendorWallet(vendorId);

  return { ok: true, vendorId };
}
