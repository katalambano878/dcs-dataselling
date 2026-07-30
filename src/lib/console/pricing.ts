import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { formatGHS } from "@/lib/format";

export interface ConsolePricingTier {
  id: string;
  name: string;
  pricePerGb: number;
  priceLabel: string;
  description: string | null;
}

function mapTier(row: {
  id: string;
  name: string;
  price_per_gb: number;
  description: string | null;
}): ConsolePricingTier {
  const price = Number(row.price_per_gb);
  return {
    id: row.id,
    name: row.name,
    pricePerGb: price,
    priceLabel: `${formatGHS(price)}/GB`,
    description: row.description,
  };
}

export async function fetchConsolePricingForVendor(
  vendorId: string,
): Promise<ConsolePricingTier | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("pricing_tier_id")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  const tierId = (acct as { pricing_tier_id: string | null } | null)?.pricing_tier_id;

  if (tierId) {
    const { data } = await service
      .from("console_pricing_tiers")
      .select("id, name, price_per_gb, description")
      .eq("id", tierId)
      .maybeSingle();
    if (data) return mapTier(data as Parameters<typeof mapTier>[0]);
  }

  const { data: fallback } = await service
    .from("console_pricing_tiers")
    .select("id, name, price_per_gb, description")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  return fallback ? mapTier(fallback as Parameters<typeof mapTier>[0]) : null;
}

export async function fetchAllConsolePricingTiers(): Promise<ConsolePricingTier[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("console_pricing_tiers")
    .select("id, name, price_per_gb, description")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row: Record<string, unknown>) => mapTier(row as Parameters<typeof mapTier>[0]));
}

export async function setConsolePricingTier(vendorId: string, tierId: string | null): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  const service = createServiceClient();
  const { error } = await service
    .from("vendor_console_accounts")
    .update({ pricing_tier_id: tierId, updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId);
  return !error;
}
