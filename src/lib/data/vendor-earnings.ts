import "server-only";
import type { NetworkId } from "@/lib/constants";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export interface VendorEarningRow {
  id: string;
  reference: string;
  orderedAt: string;
  network: NetworkId;
  packageLabel: string;
  dataMb: number;
  salePrice: number;
  basePrice: number;
  profit: number;
  status: string;
  statusLabel: string;
}

function earningsStatusLabel(status: string): string {
  switch (status) {
    case "fulfilled":
      return "DELIVERED";
    case "paid":
    case "queued":
    case "processing":
      return "PROCESSING";
    case "failed":
    case "refunded":
      return "FAILED";
    case "awaiting_momo":
    case "pending":
    default:
      return "PENDING";
  }
}

/** Storefront customer sales with sale / base / profit breakdown. */
export async function fetchVendorRecentEarnings(
  vendorId: string,
  limit = 50,
): Promise<VendorEarningRow[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const { data: orders, error } = await service
    .from("orders")
    .select("id, reference, amount, status, created_at, bundle_id, platform_fee, vendor_payout")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !orders?.length) {
    if (error) console.error("[fetchVendorRecentEarnings]", error);
    return [];
  }

  const bundleIds = [
    ...new Set<string>(
      orders.map((o: Record<string, unknown>) => (o as { bundle_id: string }).bundle_id),
    ),
  ];

  const { data: listings } = await service
    .from("vendor_listings")
    .select(
      "id, markup_amount, custom_name, wholesale_bundles ( network, data_mb, name, customer_price, suggested_retail )",
    )
    .in("id", bundleIds);

  type Wb = {
    network: NetworkId;
    data_mb: number;
    name: string;
    customer_price: number | null;
    suggested_retail: number;
  };

  const listingMap = new Map<
    string,
    { markup_amount: number; custom_name: string | null; wholesale_bundles: Wb | Wb[] | null }
  >();
  for (const raw of listings ?? []) {
    const row = raw as {
      id: string;
      markup_amount: number;
      custom_name: string | null;
      wholesale_bundles: Wb | Wb[] | null;
    };
    listingMap.set(row.id, row);
  }

  const missingIds = bundleIds.filter((id) => !listingMap.has(id));
  const legacyMap = new Map<
    string,
    { network: NetworkId; data_mb: number; name: string; price: number }
  >();
  if (missingIds.length > 0) {
    const { data: legacy } = await service
      .from("bundles")
      .select("id, network, data_mb, name, price")
      .in("id", missingIds);
    for (const raw of legacy ?? []) {
      const b = raw as {
        id: string;
        network: NetworkId;
        data_mb: number;
        name: string;
        price: number;
      };
      legacyMap.set(b.id, b);
    }
  }

  return (orders as Array<{
    id: string;
    reference: string;
    amount: number;
    status: string;
    created_at: string;
    bundle_id: string;
    platform_fee: number;
    vendor_payout: number | null;
  }>).map((row) => {
    const salePrice = Number(row.amount);
    const listing = listingMap.get(row.bundle_id);
    const legacy = legacyMap.get(row.bundle_id);

    let network: NetworkId = "mtn";
    let dataMb = 0;
    let packageLabel = "Data bundle";
    let basePrice = salePrice;

    if (listing) {
      const wb = Array.isArray(listing.wholesale_bundles)
        ? listing.wholesale_bundles[0]
        : listing.wholesale_bundles;
      if (wb) {
        network = wb.network;
        dataMb = wb.data_mb;
        packageLabel = listing.custom_name?.trim() || wb.name;
        basePrice = Number(wb.customer_price ?? wb.suggested_retail ?? salePrice - listing.markup_amount);
      }
    } else if (legacy) {
      network = legacy.network;
      dataMb = legacy.data_mb;
      packageLabel = legacy.name;
      basePrice = Number(legacy.price);
    }

    const profitFromSale = +(salePrice - basePrice).toFixed(2);
    const profit =
      profitFromSale > 0
        ? profitFromSale
        : Number(row.vendor_payout ?? salePrice - Number(row.platform_fee ?? 0));

    return {
      id: row.id,
      reference: row.reference,
      orderedAt: row.created_at,
      network,
      packageLabel,
      dataMb,
      salePrice,
      basePrice: +basePrice.toFixed(2),
      profit: +Math.max(0, profit).toFixed(2),
      status: row.status,
      statusLabel: earningsStatusLabel(row.status),
    };
  });
}
