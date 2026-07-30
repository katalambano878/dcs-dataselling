import "server-only";
import { SITE } from "@/lib/constants";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { creditVendorReward } from "@/lib/vendor/extras";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { VendorReferralStats } from "@/types";

export type ReferralSaleKind = "customer" | "wholesale";

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function randomReferralSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function getReferralRewardAmount(): Promise<number> {
  const config = await getPlatformConfig();
  return config.referralRewardGhs;
}

/** Ensure every vendor has a shareable referral code. */
export async function ensureVendorReferralCode(vendorId: string): Promise<string> {
  if (!hasSupabaseConfig()) return "";

  const service = createServiceClient();
  const { data: row } = await service
    .from("vendors")
    .select("referral_code, slug")
    .eq("id", vendorId)
    .maybeSingle();

  const existing = (row as { referral_code: string | null; slug: string } | null)?.referral_code;
  if (existing?.trim()) return existing.trim().toUpperCase();

  const slug = (row as { slug: string } | null)?.slug ?? "";
  let candidate = normalizeReferralCode(slug) || `DCS${randomReferralSuffix()}`;

  for (let i = 0; i < 5; i += 1) {
    const { data: clash } = await service
      .from("vendors")
      .select("id")
      .eq("referral_code", candidate)
      .neq("id", vendorId)
      .maybeSingle();
    if (!clash) break;
    candidate = `DCS${randomReferralSuffix()}`;
  }

  await service.from("vendors").update({ referral_code: candidate }).eq("id", vendorId);
  return candidate;
}

export async function findReferrerVendorIdByCode(code: string): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;

  const service = createServiceClient();
  const { data } = await service
    .from("vendors")
    .select("id")
    .eq("referral_code", normalized)
    .maybeSingle();

  return (data as { id: string } | null)?.id ?? null;
}

/** Link a new vendor to the referrer who invited them. */
export async function attachReferralOnSignup(
  referredVendorId: string,
  rawCode: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasSupabaseConfig()) return { ok: true };
  const code = rawCode ? normalizeReferralCode(rawCode) : "";
  if (!code) return { ok: true };

  const referrerId = await findReferrerVendorIdByCode(code);
  if (!referrerId) return { ok: false, error: "Referral code not found" };
  if (referrerId === referredVendorId) return { ok: false, error: "You cannot use your own referral code" };

  const service = createServiceClient();
  const rewardAmount = await getReferralRewardAmount();

  const { data: existing } = await service
    .from("vendor_referrals")
    .select("id")
    .eq("referred_vendor_id", referredVendorId)
    .maybeSingle();
  if (existing) return { ok: true };

  await service
    .from("vendors")
    .update({ referred_by_vendor_id: referrerId })
    .eq("id", referredVendorId);

  const { error } = await service.from("vendor_referrals").insert({
    referrer_vendor_id: referrerId,
    referred_vendor_id: referredVendorId,
    status: "pending",
    reward_amount: rewardAmount,
  });

  if (error) {
    console.error("[attachReferralOnSignup]", error);
    return { ok: false, error: "Could not save referral" };
  }

  return { ok: true };
}

async function countVendorFulfilledSales(vendorId: string): Promise<number> {
  const service = createServiceClient();

  const { count: customerCount } = await service
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("vendor_id", vendorId)
    .eq("status", "fulfilled");

  const { data: orderRows } = await service
    .from("wholesale_orders")
    .select("id")
    .eq("vendor_id", vendorId);

  const orderIds = (orderRows ?? []).map((r: Record<string, unknown>) => (r as { id: string }).id);
  let wholesaleCount = 0;
  if (orderIds.length > 0) {
    const { count } = await service
      .from("wholesale_order_items")
      .select("*", { count: "exact", head: true })
      .in("wholesale_order_id", orderIds)
      .eq("status", "fulfilled");
    wholesaleCount = count ?? 0;
  }

  return (customerCount ?? 0) + wholesaleCount;
}

/**
 * Credit referrer when a referred vendor completes their first fulfilled sale.
 * Idempotent — only pays once per referral row.
 */
export async function tryCreditReferralReward(
  referredVendorId: string,
  sale: { kind: ReferralSaleKind; reference: string },
): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const fulfilledCount = await countVendorFulfilledSales(referredVendorId);
  if (fulfilledCount !== 1) return;

  const service = createServiceClient();
  const { data: referral } = await service
    .from("vendor_referrals")
    .select("id, referrer_vendor_id, status, reward_amount")
    .eq("referred_vendor_id", referredVendorId)
    .eq("status", "pending")
    .maybeSingle();

  const row = referral as {
    id: string;
    referrer_vendor_id: string;
    status: string;
    reward_amount: number;
  } | null;

  if (!row) return;

  const amount = Number(row.reward_amount);
  if (amount <= 0) return;

  const ref = `REF-${sale.reference}`;
  await creditVendorReward(row.referrer_vendor_id, amount, ref);

  await service
    .from("vendor_referrals")
    .update({
      status: "rewarded",
      rewarded_at: new Date().toISOString(),
      first_sale_kind: sale.kind,
      first_sale_reference: sale.reference,
    })
    .eq("id", row.id);
}

/** Call after a customer storefront order is marked fulfilled. */
export async function tryCreditReferralForCustomerOrder(orderId: string): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const service = createServiceClient();
  const { data } = await service
    .from("orders")
    .select("vendor_id, reference, status")
    .eq("id", orderId)
    .maybeSingle();

  const row = data as { vendor_id: string; reference: string; status: string } | null;
  if (!row || row.status !== "fulfilled") return;

  await tryCreditReferralReward(row.vendor_id, { kind: "customer", reference: row.reference });
}

/** Call after a wholesale line item is marked fulfilled. */
export async function tryCreditReferralForWholesaleItem(itemId: string): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const service = createServiceClient();
  const { data } = await service
    .from("wholesale_order_items")
    .select(
      `
      id, status,
      wholesale_orders!inner ( vendor_id, reference )
    `,
    )
    .eq("id", itemId)
    .maybeSingle();

  type Row = {
    id: string;
    status: string;
    wholesale_orders:
      | { vendor_id: string; reference: string }
      | { vendor_id: string; reference: string }[];
  };

  const row = data as Row | null;
  if (!row || row.status !== "fulfilled") return;

  const order = Array.isArray(row.wholesale_orders)
    ? row.wholesale_orders[0]
    : row.wholesale_orders;
  if (!order?.vendor_id) return;

  await tryCreditReferralReward(order.vendor_id, {
    kind: "wholesale",
    reference: order.reference,
  });
}

export async function fetchVendorReferralStats(vendorId: string): Promise<VendorReferralStats> {
  const code = await ensureVendorReferralCode(vendorId);
  const rewardAmount = await getReferralRewardAmount();
  const baseUrl = SITE.url.replace(/\/$/, "");
  const inviteLink = `${baseUrl}/create-store?ref=${encodeURIComponent(code)}`;

  if (!hasSupabaseConfig()) {
    return {
      referralCode: code,
      inviteLink,
      rewardAmount,
      totalInvites: 0,
      pendingInvites: 0,
      rewardedInvites: 0,
      totalEarned: 0,
      recent: [],
    };
  }

  const service = createServiceClient();
  const { data: rows } = await service
    .from("vendor_referrals")
    .select(
      `
      id, status, reward_amount, rewarded_at, created_at,
      referred:vendors!vendor_referrals_referred_vendor_id_fkey ( business_name )
    `,
    )
    .eq("referrer_vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(20);

  type Row = {
    id: string;
    status: string;
    reward_amount: number;
    rewarded_at: string | null;
    created_at: string;
    referred: { business_name: string } | { business_name: string }[] | null;
  };

  const list = (rows ?? []) as Row[];
  let pendingInvites = 0;
  let rewardedInvites = 0;
  let totalEarned = 0;

  for (const r of list) {
    if (r.status === "rewarded") {
      rewardedInvites += 1;
      totalEarned += Number(r.reward_amount);
    } else if (r.status === "pending") {
      pendingInvites += 1;
    }
  }

  return {
    referralCode: code,
    inviteLink,
    rewardAmount,
    totalInvites: list.length,
    pendingInvites,
    rewardedInvites,
    totalEarned: +totalEarned.toFixed(2),
    recent: list.map((r) => {
      const referred = Array.isArray(r.referred) ? r.referred[0] : r.referred;
      return {
        id: r.id,
        businessName: referred?.business_name ?? "Agent",
        status: r.status,
        rewardedAt: r.rewarded_at,
        createdAt: r.created_at,
      };
    }),
  };
}
