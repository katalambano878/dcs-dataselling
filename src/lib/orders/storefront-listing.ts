import "server-only";

import type { DbClient } from "@/lib/db/client";
import type { NetworkId } from "@/lib/constants";

export interface StorefrontOrderBundle {
  name: string;
  network: NetworkId;
  data_mb: number;
  validity_days: number;
}

type ListingRow = {
  custom_name: string | null;
  wholesale_bundles:
    | {
        name: string;
        network: NetworkId;
        data_mb: number;
        validity_days: number;
      }
    | {
        name: string;
        network: NetworkId;
        data_mb: number;
        validity_days: number;
      }[]
    | null;
};

type LegacyBundleRow = {
  name: string;
  network: NetworkId;
  data_mb: number;
  validity_days: number;
};

function fromListingRow(row: ListingRow): StorefrontOrderBundle | null {
  const wb = Array.isArray(row.wholesale_bundles)
    ? row.wholesale_bundles[0]
    : row.wholesale_bundles;
  if (!wb) return null;
  return {
    name: row.custom_name?.trim() || wb.name,
    network: wb.network,
    data_mb: wb.data_mb,
    validity_days: wb.validity_days,
  };
}

/** Resolve bundle metadata for a storefront order's `bundle_id` (vendor_listings.id in production). */
export async function fetchStorefrontOrderBundle(
  service: DbClient,
  bundleId: string,
): Promise<StorefrontOrderBundle | null> {
  const { data: listing } = await service
    .from("vendor_listings")
    .select("custom_name, wholesale_bundles ( name, network, data_mb, validity_days )")
    .eq("id", bundleId)
    .maybeSingle();

  if (listing) {
    const resolved = fromListingRow(listing as ListingRow);
    if (resolved) return resolved;
  }

  const { data: legacy } = await service
    .from("bundles")
    .select("name, network, data_mb, validity_days")
    .eq("id", bundleId)
    .maybeSingle();

  if (!legacy) return null;
  const b = legacy as LegacyBundleRow;
  return {
    name: b.name,
    network: b.network,
    data_mb: b.data_mb,
    validity_days: b.validity_days,
  };
}

/** Batch-resolve bundle metadata for many storefront orders. */
export async function fetchStorefrontOrderBundlesBatch(
  service: DbClient,
  bundleIds: string[],
): Promise<Map<string, StorefrontOrderBundle>> {
  const map = new Map<string, StorefrontOrderBundle>();
  const unique = [...new Set(bundleIds.filter(Boolean))];
  if (unique.length === 0) return map;

  const { data: listings } = await service
    .from("vendor_listings")
    .select("id, custom_name, wholesale_bundles ( name, network, data_mb, validity_days )")
    .in("id", unique);

  const missing: string[] = [];
  for (const id of unique) {
    const row = (listings ?? []).find((r: Record<string, unknown>) => (r as { id: string }).id === id) as
      | ({ id: string } & ListingRow)
      | undefined;
    if (row) {
      const resolved = fromListingRow(row);
      if (resolved) {
        map.set(id, resolved);
        continue;
      }
    }
    missing.push(id);
  }

  if (missing.length > 0) {
    const { data: legacy } = await service
      .from("bundles")
      .select("id, name, network, data_mb, validity_days")
      .in("id", missing);
    for (const raw of legacy ?? []) {
      const b = raw as LegacyBundleRow & { id: string };
      map.set(b.id, {
        name: b.name,
        network: b.network,
        data_mb: b.data_mb,
        validity_days: b.validity_days,
      });
    }
  }

  return map;
}
