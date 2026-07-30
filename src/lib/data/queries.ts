import "server-only";
import { createClient, createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { formatDataAmount } from "@/lib/format";
import type { Bundle, PlatformStats, Vendor } from "@/types";

export interface LiveActivityItem {
  label: string;
  bundleLabel: string;
  network: string;
  timeAgo: string;
}

const EMPTY_STATS: PlatformStats = {
  ordersToday: 0,
  ordersFulfilled: 0,
  activeVendors: 0,
  successRate: 100,
};

function rowToBundle(row: {
  id: string;
  vendor_id: string;
  network: "mtn" | "telecel" | "at";
  name: string;
  data_mb: number;
  validity_days: number;
  price: number;
  original_price: number | null;
  popular: boolean;
  recommended: boolean;
  sales_count: number;
  vendor_slug: string;
  vendor_name: string;
  vendor_verified: boolean;
  vendor_rating: number;
  vendor_fulfilment_minutes: number;
}): Bundle {
  return {
    id: row.id,
    vendorId: row.vendor_id,
    network: row.network,
    name: row.name,
    dataMb: row.data_mb,
    validityDays: row.validity_days,
    price: Number(row.price),
    originalPrice: row.original_price ? Number(row.original_price) : null,
    popular: row.popular,
    recommended: row.recommended,
    active: true,
    salesCount: row.sales_count,
    vendor: {
      id: row.vendor_id,
      slug: row.vendor_slug,
      businessName: row.vendor_name,
      verified: row.vendor_verified,
      rating: Number(row.vendor_rating),
      fulfilmentMinutes: row.vendor_fulfilment_minutes,
    },
  };
}

function rowToVendor(row: {
  id: string;
  slug: string;
  business_name: string;
  tagline: string | null;
  logo_url: string | null;
  status: "pending" | "approved" | "suspended" | "rejected";
  verified: boolean;
  rating: number;
  total_orders: number;
  fulfilment_minutes: number;
  commission_rate: number;
  featured: boolean;
  theme_color?: string | null;
  emoji?: string | null;
  whatsapp_number?: string | null;
  created_at: string;
}): Vendor {
  return {
    id: row.id,
    slug: row.slug,
    businessName: row.business_name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    status: row.status,
    verified: row.verified,
    rating: Number(row.rating),
    totalOrders: row.total_orders,
    fulfilmentMinutes: row.fulfilment_minutes,
    commissionRate: Number(row.commission_rate),
    featured: row.featured,
    themeColor: row.theme_color ?? undefined,
    emoji: row.emoji ?? undefined,
    whatsappNumber: row.whatsapp_number ?? undefined,
    createdAt: row.created_at,
  };
}

export async function fetchBundleById(id: string): Promise<Bundle | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_bundles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    console.error("[fetchBundleById]", error);
    return null;
  }
  return rowToBundle(data);
}

export async function fetchVendorBySlug(slug: string): Promise<Vendor | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vendors")
    .select(
      "id, slug, business_name, tagline, logo_url, status, verified, rating, total_orders, fulfilment_minutes, commission_rate, featured, theme_color, emoji, whatsapp_number, created_at",
    )
    .eq("slug", slug)
    .eq("status", "approved")
    .maybeSingle();
  if (error || !data) return null;
  return rowToVendor(data);
}

export async function fetchVendorBundles(vendorId: string): Promise<Bundle[]> {
  if (!hasSupabaseConfig()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marketplace_bundles")
    .select("*")
    .eq("vendor_id", vendorId)
    .order("sales_count", { ascending: false });
  if (error || !data) return [];
  return data.map(rowToBundle);
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  if (!hasSupabaseConfig()) return EMPTY_STATS;

  const supabase = await createClient();
  const { data, error } = await supabase.from("platform_stats").select("*").maybeSingle();

  if (!error && data) {
    return {
      ordersToday: data.orders_today ?? 0,
      ordersFulfilled: data.orders_fulfilled_today ?? 0,
      activeVendors: data.active_vendors ?? 0,
      successRate: Number(data.success_rate ?? 100),
    };
  }

  const service = createServiceClient();
  const startOfToday = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const [ordersRes, vendorsRes] = await Promise.all([
    service.from("orders").select("status, created_at"),
    service.from("vendors").select("id").eq("status", "approved"),
  ]);

  const orders = (ordersRes.data ?? []) as { status: string; created_at: string }[];
  const today = orders.filter((o) => o.created_at >= startOfToday);
  const fulfilled = orders.filter((o) => o.status === "fulfilled").length;
  const successRate =
    orders.length > 0 ? Math.round((fulfilled / orders.length) * 1000) / 10 : 100;

  return {
    ordersToday: today.length,
    ordersFulfilled: today.filter((o) => o.status === "fulfilled").length,
    activeVendors: vendorsRes.data?.length ?? 0,
    successRate,
  };
}

function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export async function fetchRecentActivity(limit = 12): Promise<LiveActivityItem[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data, error } = await service
    .from("orders")
    .select(
      `
      fulfilled_at, created_at, recipient_phone,
      bundles ( name, data_mb, network )
    `,
    )
    .in("status", ["fulfilled", "paid", "processing"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data?.length) return [];

  return data.map((row: Record<string, unknown>) => {
    const r = row as {
      fulfilled_at: string | null;
      created_at: string;
      recipient_phone: string;
      bundles:
        | { name: string; data_mb: number; network: string }
        | { name: string; data_mb: number; network: string }[]
        | null;
    };
    const bundle = Array.isArray(r.bundles) ? r.bundles[0] : r.bundles;
    const phone = r.recipient_phone.replace(/\D/g, "");
    const masked = phone.length >= 4 ? `···${phone.slice(-4)}` : "Customer";
    const net =
      bundle?.network === "mtn"
        ? "MTN"
        : bundle?.network === "telecel"
          ? "Telecel"
          : "AT";
    const mb = bundle?.data_mb
      ? formatDataAmount(bundle.data_mb)
      : bundle?.name ?? "Data";
    return {
      label: masked,
      bundleLabel: mb,
      network: net,
      timeAgo: formatTimeAgo(r.fulfilled_at ?? r.created_at),
    };
  });
}
