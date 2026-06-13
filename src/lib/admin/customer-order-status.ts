import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { creditVendorReward } from "@/lib/vendor/extras";
import { getVendorTierForReward } from "@/lib/data/admin-tier-ops";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { getTierConfigFromSettings } from "@/lib/vendor/tiers";
import { smsOrderFulfilled } from "@/lib/notifications/sms";
import { formatDataAmount } from "@/lib/format";
import { tryCreditReferralForCustomerOrder } from "@/lib/referrals/vendor-referral";
import type { OrderStatus } from "@/lib/constants";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";

export async function applyCustomerOrderStatus(
  service: SupabaseClient,
  orderId: string,
  status: OrderStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === "fulfilled") {
    updates.fulfilled_at = new Date().toISOString();
  }

  const { data: existing } = await service
    .from("orders")
    .select(
      "id, vendor_id, status, amount, platform_fee, reference, recipient_phone, reward_credited_at, bundle_id",
    )
    .eq("id", orderId)
    .maybeSingle();

  const { error } = await service.from("orders").update(updates).eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  const prev = existing as {
    id: string;
    vendor_id: string;
    status: string;
    amount: number;
    platform_fee: number;
    reference: string;
    recipient_phone: string;
    reward_credited_at: string | null;
    bundle_id: string;
  } | null;

  if (status === "fulfilled" && prev && prev.status !== "fulfilled") {
    if (!prev.reward_credited_at) {
      const tier = await getVendorTierForReward(prev.vendor_id);
      const settings = await getAgentTierSettings();
      const rewardRate = getTierConfigFromSettings(tier, settings).rewardRate;
      const markupEstimate =
        Math.max(0, Number(prev.amount) - Number(prev.platform_fee)) * rewardRate;
      if (markupEstimate > 0) {
        await creditVendorReward(prev.vendor_id, +markupEstimate.toFixed(2), prev.reference);
        await service
          .from("orders")
          .update({ reward_credited_at: new Date().toISOString() })
          .eq("id", prev.id);
      }
    }

    const bundle = await fetchStorefrontOrderBundle(service, prev.bundle_id);
    const bundleLabel = bundle
      ? `${formatDataAmount(bundle.data_mb)} ${bundle.name}`
      : "Data bundle";
    const recipientPhone = prev.recipient_phone;
    const reference = prev.reference;
    const orderId2 = prev.id;
    after(() =>
      smsOrderFulfilled({
        phone: recipientPhone,
        reference,
        bundleLabel,
      }),
    );

    after(() => tryCreditReferralForCustomerOrder(orderId2));
  }

  return { ok: true };
}
