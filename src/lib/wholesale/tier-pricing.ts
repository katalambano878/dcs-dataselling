import type { VendorTier } from "@/types";

/** Full pricing matrix for one wholesale SKU (matches admin grid). */
export interface WholesalePriceMatrix {
  costPrice: number;
  customerPrice: number;
  customerProPrice: number;
  agentPrice: number;
  agentProPrice: number;
  xpressAgentPrice: number;
  /** Buy price for Express agents (admin-assigned). Falls back to costPrice. */
  expressAgentPrice: number;
}

type RowLike = Partial<WholesalePriceMatrix> & {
  wholesalePrice?: number;
  suggestedRetail?: number;
};

/** Normalize DB/API row into a complete matrix, falling back to legacy columns. */
export function normalizeWholesalePrices(row: RowLike): WholesalePriceMatrix {
  const agentPrice = num(row.agentPrice ?? row.wholesalePrice, 0);
  const customerPrice = num(row.customerPrice ?? row.suggestedRetail, agentPrice);
  const costPrice = num(row.costPrice, round(agentPrice * 0.93));
  return {
    costPrice,
    customerPrice,
    customerProPrice: num(row.customerProPrice, round(customerPrice * 0.93)),
    agentPrice,
    agentProPrice: num(row.agentProPrice, agentPrice),
    xpressAgentPrice: num(row.xpressAgentPrice, agentPrice),
    expressAgentPrice: num(row.expressAgentPrice, costPrice),
  };
}

/**
 * Resolve the buy price for an agent based on their role tier.
 * starter → Agent price
 * verified → Super Agent price (stored in xpressAgentPrice column)
 * pro → Pro Agent price (stored in agentProPrice column)
 * express → Express Agent price (stored in expressAgentPrice, defaults to cost)
 */
export function resolveAgentBuyPrice(
  prices: WholesalePriceMatrix | RowLike,
  tier: VendorTier = "starter",
): number {
  const p = normalizeWholesalePrices(prices);
  switch (tier) {
    case "express":
      return p.expressAgentPrice;
    case "pro":
      return p.agentProPrice;
    case "verified":
      return p.xpressAgentPrice;
    default:
      return p.agentPrice;
  }
}

export function tierBuyPriceLabel(tier: VendorTier): string {
  switch (tier) {
    case "express":
      return "Express Agent price";
    case "pro":
      return "Pro Agent price";
    case "verified":
      return "Super Agent price";
    default:
      return "Agent price";
  }
}

/** Keep legacy columns in sync when admin saves the matrix. */
export function legacyPriceSync(prices: WholesalePriceMatrix, minMarkup = 0) {
  const wholesale = prices.agentPrice;
  const minRetail = round(wholesale + Math.max(0, minMarkup));
  const suggested = Math.max(prices.customerPrice, minRetail);
  return {
    wholesale_price: wholesale,
    suggested_retail: suggested,
  };
}

/**
 * Normalize admin matrix input and satisfy DB rules:
 * - Tier ladder: cost ≤ Pro ≤ Super ≤ Agent
 * - Legacy columns: suggested_retail ≥ wholesale_price (+ min markup headroom for vendors)
 */
export function prepareWholesalePricesForSave(
  input: RowLike,
  minMarkup: number,
): WholesalePriceMatrix {
  const raw = normalizeWholesalePrices(input);
  const cost = num(raw.costPrice, 0);
  let agent = num(raw.agentPrice, 0);
  let pro = num(raw.agentProPrice, agent);
  let xpress = num(raw.xpressAgentPrice, agent);
  // Express sits at the bottom of the ladder: at least cost, at most agent.
  let express = num(raw.expressAgentPrice, cost);

  agent = Math.max(agent, cost);
  pro = clamp(pro, cost, agent);
  xpress = clamp(xpress, pro, agent);
  express = clamp(express, cost, agent);

  const markup = Math.max(0, minMarkup);
  const minRetail = round(agent + markup);
  const customer = Math.max(raw.customerPrice, minRetail);

  return {
    costPrice: cost,
    agentPrice: agent,
    agentProPrice: pro,
    xpressAgentPrice: xpress,
    expressAgentPrice: express,
    customerPrice: customer,
    customerProPrice: Math.min(num(raw.customerProPrice, round(customer * 0.93)), customer),
  };
}

/** Human-readable validation before hitting Postgres. */
export function validateWholesalePrices(
  prices: WholesalePriceMatrix,
  minMarkup: number,
): string | null {
  if (prices.costPrice > prices.agentProPrice) {
    return "Cost must be less than or equal to Pro Agent price.";
  }
  if (prices.agentProPrice > prices.xpressAgentPrice) {
    return "Pro Agent price must be less than or equal to Super Agent price.";
  }
  if (prices.xpressAgentPrice > prices.agentPrice) {
    return "Super Agent price must be less than or equal to Agent price.";
  }
  const minRetail = prices.agentPrice + Math.max(0, minMarkup);
  if (prices.customerPrice < minRetail - 0.001) {
    return `Storefront base price must be at least ₵${minRetail.toFixed(2)} (Agent ₵${prices.agentPrice.toFixed(2)} + min markup ₵${minMarkup.toFixed(2)}).`;
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
