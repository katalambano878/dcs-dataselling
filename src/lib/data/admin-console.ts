import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { VendorConsoleAccount } from "@/lib/console/account";

export interface AdminConsoleVendorRow {
  vendorId: string;
  businessName: string;
  slug: string;
  status: string;
  enabled: boolean;
  balanceMb: number;
  totalSends: number;
  pricingTierId: string | null;
  pricingTierName: string | null;
}

export async function fetchAdminConsoleVendors(): Promise<AdminConsoleVendorRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();

  const { data: vendors } = await service
    .from("vendors")
    .select("id, business_name, slug, status")
    .order("business_name");

  const { data: accounts } = await service
    .from("vendor_console_accounts")
    .select("vendor_id, enabled, balance_mb, total_sends, pricing_tier_id");

  const { data: tiers } = await service
    .from("console_pricing_tiers")
    .select("id, name");

  const tierMap = new Map(
    (tiers ?? []).map((t) => {
      const r = t as { id: string; name: string };
      return [r.id, r.name];
    }),
  );

  const acctMap = new Map(
    (accounts ?? []).map((a) => {
      const r = a as {
        vendor_id: string;
        enabled: boolean;
        balance_mb: number;
        total_sends: number;
        pricing_tier_id: string | null;
      };
      return [r.vendor_id, r];
    }),
  );

  return (vendors ?? []).map((v) => {
    const row = v as { id: string; business_name: string; slug: string; status: string };
    const acct = acctMap.get(row.id);
    const tierId = acct?.pricing_tier_id ?? null;
    return {
      vendorId: row.id,
      businessName: row.business_name,
      slug: row.slug,
      status: row.status,
      enabled: acct?.enabled ?? false,
      balanceMb: Number(acct?.balance_mb ?? 0),
      totalSends: acct?.total_sends ?? 0,
      pricingTierId: tierId,
      pricingTierName: tierId ? tierMap.get(tierId) ?? null : null,
    };
  });
}

export function toConsoleSummary(account: VendorConsoleAccount | null) {
  return {
    enabled: account?.enabled ?? false,
    balanceMb: account?.balanceMb ?? 0,
    totalSends: account?.totalSends ?? 0,
  };
}
