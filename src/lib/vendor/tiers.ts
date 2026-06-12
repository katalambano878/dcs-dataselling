import type { VendorTier } from "@/types";
import type { AgentTierSettings, AgentTierPricing } from "@/lib/vendor/tier-settings-types";

export const VENDOR_TIERS: VendorTier[] = ["starter", "verified", "pro", "express"];

export interface TierConfig extends AgentTierPricing {
  id: VendorTier;
}

export const DEFAULT_AGENT_TIER_SETTINGS: AgentTierSettings = {
  tiers: {
    starter: {
      label: "Agent",
      description: "Base tier for new agents",
      commissionRate: 8,
      rewardRate: 0.1,
      minWithdrawal: 50,
    },
    verified: {
      label: "Super Agent",
      description: "Proven sellers with consistent volume",
      commissionRate: 6,
      rewardRate: 0.15,
      minWithdrawal: 30,
    },
    pro: {
      label: "Pro Agent",
      description: "Top performers with high daily sales",
      commissionRate: 4,
      rewardRate: 0.2,
      minWithdrawal: 20,
    },
    express: {
      label: "Express Agent",
      description: "Supplier pricing — manually assigned by admin",
      commissionRate: 2,
      rewardRate: 0.25,
      minWithdrawal: 10,
    },
  },
  promotion: {
    verified: {
      minFulfilledOrders: 50,
      minSuccessRate: 90,
      minDailyOrders: 30,
    },
    pro: {
      minFulfilledOrders: 500,
      minSuccessRate: 95,
      minDailyOrders: 100,
    },
  },
};

/** @deprecated Use getAgentTierSettings() — kept for static fallbacks */
export const TIER_CONFIG: Record<VendorTier, TierConfig> = Object.fromEntries(
  VENDOR_TIERS.map((id) => [
    id,
    { id, ...DEFAULT_AGENT_TIER_SETTINGS.tiers[id] },
  ]),
) as Record<VendorTier, TierConfig>;

export function normalizeAgentTierSettings(input: unknown): AgentTierSettings {
  const base = DEFAULT_AGENT_TIER_SETTINGS;
  if (!input || typeof input !== "object") return base;

  const raw = input as Partial<AgentTierSettings>;
  const tiers = { ...base.tiers };
  for (const id of VENDOR_TIERS) {
    const row = raw.tiers?.[id];
    if (!row) continue;
    tiers[id] = {
      label: String(row.label ?? base.tiers[id].label).trim() || base.tiers[id].label,
      description: String(row.description ?? base.tiers[id].description).trim() || base.tiers[id].description,
      commissionRate: clampNum(row.commissionRate, base.tiers[id].commissionRate, 0, 50),
      rewardRate: clampNum(row.rewardRate, base.tiers[id].rewardRate, 0, 1),
      minWithdrawal: clampNum(row.minWithdrawal, base.tiers[id].minWithdrawal, 1, 100000),
    };
  }

  return {
    tiers,
    promotion: {
      verified: normalizePromotion(raw.promotion?.verified, base.promotion.verified),
      pro: normalizePromotion(raw.promotion?.pro, base.promotion.pro),
    },
  };
}

function normalizePromotion(
  input: Partial<AgentTierSettings["promotion"]["verified"]> | undefined,
  fallback: AgentTierSettings["promotion"]["verified"],
) {
  return {
    minFulfilledOrders: clampInt(input?.minFulfilledOrders, fallback.minFulfilledOrders, 0, 1_000_000),
    minSuccessRate: clampNum(input?.minSuccessRate, fallback.minSuccessRate, 0, 100),
    minDailyOrders: clampInt(input?.minDailyOrders, fallback.minDailyOrders, 0, 100_000),
  };
}

function clampNum(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  return Math.round(clampNum(value, fallback, min, max));
}

export function getTierConfigFromSettings(
  tier: VendorTier | null | undefined,
  settings: AgentTierSettings = DEFAULT_AGENT_TIER_SETTINGS,
): TierConfig {
  const id = tier && tier in settings.tiers ? tier : "starter";
  return { id, ...settings.tiers[id] };
}

export function getTierConfig(tier: VendorTier | null | undefined): TierConfig {
  return getTierConfigFromSettings(tier, DEFAULT_AGENT_TIER_SETTINGS);
}

export function getTierLabel(
  tier: VendorTier | null | undefined,
  settings?: AgentTierSettings,
): string {
  if (settings) return getTierConfigFromSettings(tier, settings).label;
  return getTierConfig(tier).label;
}

export function tierUpdatesFor(
  tier: VendorTier,
  manual = true,
  settings: AgentTierSettings = DEFAULT_AGENT_TIER_SETTINGS,
) {
  const config = getTierConfigFromSettings(tier, settings);
  return {
    tier,
    commission_rate: config.commissionRate,
    tier_manual: manual,
    updated_at: new Date().toISOString(),
  };
}
