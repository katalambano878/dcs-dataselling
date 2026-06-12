import type { AgentTierSettings } from "@/lib/vendor/tier-settings-types";
import {
  DEFAULT_AGENT_TIER_SETTINGS,
  getTierConfigFromSettings,
} from "@/lib/vendor/tiers";
import type { VendorTier } from "@/types";

export type { AgentTierSettings };

export interface VendorPerformanceSnapshot {
  vendorId: string;
  currentTier: VendorTier;
  tierManual: boolean;
  fulfilledOrders: number;
  totalOrders: number;
  successRate: number;
  ordersToday: number;
}

export interface TierPromotionResult {
  vendorId: string;
  fromTier: VendorTier;
  toTier: VendorTier;
  reason: string;
}

const TIER_RANK: Record<VendorTier, number> = {
  starter: 0,
  verified: 1,
  pro: 2,
  express: 3,
};

function meetsTierRules(
  p: VendorPerformanceSnapshot,
  rules: AgentTierSettings["promotion"]["verified"],
): string | null {
  if (p.ordersToday >= rules.minDailyOrders) {
    return `${p.ordersToday} orders today (≥${rules.minDailyOrders})`;
  }
  if (
    p.fulfilledOrders >= rules.minFulfilledOrders &&
    p.successRate >= rules.minSuccessRate
  ) {
    return `${p.fulfilledOrders} fulfilled orders at ${p.successRate}% success`;
  }
  return null;
}

/** Suggest the highest tier a vendor qualifies for based on performance. Never downgrades. */
export function resolveTierFromPerformance(
  snapshot: VendorPerformanceSnapshot,
  settings: AgentTierSettings = DEFAULT_AGENT_TIER_SETTINGS,
): TierPromotionResult | null {
  if (snapshot.tierManual) return null;

  let target: VendorTier = snapshot.currentTier;
  let reason = "";

  const proReason = meetsTierRules(snapshot, settings.promotion.pro);
  if (proReason) {
    target = "pro";
    reason = proReason;
  } else {
    const superReason = meetsTierRules(snapshot, settings.promotion.verified);
    if (superReason) {
      target = "verified";
      reason = superReason;
    }
  }

  if (TIER_RANK[target] <= TIER_RANK[snapshot.currentTier]) return null;

  return {
    vendorId: snapshot.vendorId,
    fromTier: snapshot.currentTier,
    toTier: target,
    reason,
  };
}

export function formatTierRolesSummary(
  settings: AgentTierSettings = DEFAULT_AGENT_TIER_SETTINGS,
): string {
  const v = settings.promotion.verified;
  const p = settings.promotion.pro;
  const verifiedLabel = getTierConfigFromSettings("verified", settings).label;
  const proLabel = getTierConfigFromSettings("pro", settings).label;
  return [
    `${verifiedLabel}: ${v.minFulfilledOrders}+ fulfilled @ ${v.minSuccessRate}%+ success, or ${v.minDailyOrders}+ orders/day`,
    `${proLabel}: ${p.minFulfilledOrders}+ fulfilled @ ${p.minSuccessRate}%+ success, or ${p.minDailyOrders}+ orders/day`,
  ].join(" · ");
}

/** @deprecated Use formatTierRolesSummary */
export const formatTierRulesSummary = formatTierRolesSummary;
