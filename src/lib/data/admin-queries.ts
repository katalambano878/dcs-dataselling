import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { VendorStatus, VendorTier } from "@/types";

export interface AdminVendorRow {
  id: string;
  slug: string;
  business_name: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  status: VendorStatus;
  kyc_status: string | null;
  verified: boolean;
  featured: boolean;
  tier: VendorTier;
  tier_manual: boolean;
  commission_rate: number;
  rating: number;
  total_orders: number;
  fulfilment_minutes: number;
  api_only: boolean;
  created_at: string;
}

export interface AdminOverviewMetrics {
  gmv30d: number;
  platformRevenue30d: number;
  ordersToday: number;
  ordersFulfilledToday: number;
  activeVendors: number;
  /** Share of orders that received payment (paid / queued / processing / fulfilled). */
  successRate: number;
  /** Share of paid orders that reached fulfilled status. */
  fulfillmentRate: number;
  paystackShare: number;
}

export interface AdminCustomerPaymentRow {
  id: string;
  reference: string;
  recipient_phone: string;
  amount: number;
  platform_fee: number;
  status: string;
  payment_provider: string | null;
  created_at: string;
  vendor_name: string;
  vendor_slug: string;
  bundle_name: string | null;
}

const PAYMENT_SUCCESS_STATUSES = ["paid", "queued", "processing", "fulfilled"] as const;

export interface AdminTopCustomer {
  userId: string;
  name: string;
  orders: number;
  spend: number;
}

const THIRTY_DAYS_AGO = () =>
  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

export async function fetchAdminVendors(): Promise<AdminVendorRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from("vendors")
    .select(
      "id, user_id, slug, business_name, status, kyc_status, verified, featured, tier, tier_manual, commission_rate, rating, total_orders, fulfilment_minutes, api_only, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[fetchAdminVendors]", error);
    return [];
  }

  const rows = (data ?? []) as Array<
    AdminVendorRow & { user_id: string }
  >;
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];

  const profileByUserId = new Map<
    string,
    { full_name: string | null; email: string | null; phone: string | null }
  >();

  if (userIds.length > 0) {
    const { data: profiles, error: profileErr } = await service
      .from("profiles")
      .select("id, full_name, email, phone")
      .in("id", userIds);

    if (profileErr) {
      console.error("[fetchAdminVendors] profiles", profileErr);
    } else {
      for (const p of profiles ?? []) {
        const row = p as {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
        };
        profileByUserId.set(row.id, {
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
        });
      }
    }
  }

  return rows.map((row) => {
    const { user_id, ...vendor } = row;
    const profile = profileByUserId.get(user_id);
    return {
      ...vendor,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      tier: vendor.tier ?? "starter",
      tier_manual: vendor.tier_manual ?? false,
      commission_rate: Number(vendor.commission_rate ?? 8),
      api_only: Boolean(vendor.api_only),
    };
  });
}

/**
 * Stage of a registered account that does not yet have a vendor store.
 *  - paid_awaiting_store: paid the setup fee but never submitted the store (most urgent)
 *  - setup_started:       started the store wizard / setup payment but never paid
 *  - account_only:        created an account, never started the store wizard
 */
export type RegistrationStage =
  | "paid_awaiting_store"
  | "setup_started"
  | "account_only";

export interface PendingRegistrationRow {
  userId: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: string | null;
  registeredAt: string;
  stage: RegistrationStage;
  intendedBusinessName: string | null;
  intendedSlug: string | null;
  setupPaymentStatus: string | null;
  setupReference: string | null;
  setupPaidAt: string | null;
}

const STAGE_PRIORITY: Record<RegistrationStage, number> = {
  paid_awaiting_store: 0,
  setup_started: 1,
  account_only: 2,
};

/**
 * Accounts that have registered but do NOT yet have a vendor store row.
 * These are invisible on the main vendors list (which only reads `vendors`),
 * yet the admin needs to see them — especially anyone who already paid the
 * setup fee but never finished submitting their store.
 */
export async function fetchPendingRegistrations(
  limit = 100,
): Promise<PendingRegistrationRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();

  const [profilesRes, vendorsRes, setupRes] = await Promise.all([
    service
      .from("profiles")
      .select("id, email, full_name, phone, role, created_at")
      .neq("role", "admin")
      .order("created_at", { ascending: false }),
    service.from("vendors").select("user_id"),
    service
      .from("vendor_setup_payments")
      .select("user_id, business_name, slug, status, reference, created_at, paid_at")
      .order("created_at", { ascending: false }),
  ]);

  if (profilesRes.error) {
    console.error("[fetchPendingRegistrations]", profilesRes.error);
    return [];
  }

  const vendorUserIds = new Set(
    ((vendorsRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );

  // Latest setup payment per user (rows already sorted newest-first).
  const latestSetup = new Map<
    string,
    {
      business_name: string | null;
      slug: string | null;
      status: string | null;
      reference: string | null;
      paid_at: string | null;
    }
  >();
  for (const row of (setupRes.data ?? []) as {
    user_id: string;
    business_name: string | null;
    slug: string | null;
    status: string | null;
    reference: string | null;
    paid_at: string | null;
  }[]) {
    if (!latestSetup.has(row.user_id)) latestSetup.set(row.user_id, row);
  }

  const profiles = (profilesRes.data ?? []) as {
    id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: string | null;
    created_at: string;
  }[];

  const rows: PendingRegistrationRow[] = profiles
    .filter((p) => !vendorUserIds.has(p.id))
    .map((p) => {
      const setup = latestSetup.get(p.id);
      const stage: RegistrationStage = !setup
        ? "account_only"
        : setup.status === "paid"
          ? "paid_awaiting_store"
          : "setup_started";
      return {
        userId: p.id,
        email: p.email,
        fullName: p.full_name,
        phone: p.phone,
        role: p.role,
        registeredAt: p.created_at,
        stage,
        intendedBusinessName: setup?.business_name ?? null,
        intendedSlug: setup?.slug ?? null,
        setupPaymentStatus: setup?.status ?? null,
        setupReference: setup?.reference ?? null,
        setupPaidAt: setup?.paid_at ?? null,
      };
    });

  rows.sort((a, b) => {
    const byStage = STAGE_PRIORITY[a.stage] - STAGE_PRIORITY[b.stage];
    if (byStage !== 0) return byStage;
    return b.registeredAt.localeCompare(a.registeredAt);
  });

  return rows.slice(0, limit);
}

export async function fetchAdminOverview(): Promise<AdminOverviewMetrics | null> {
  if (!hasSupabaseConfig()) return null;

  const service = createServiceClient();
  const since = THIRTY_DAYS_AGO();

  const [orders30d, ordersToday, vendorsRes, platformStats] = await Promise.all([
    service
      .from("orders")
      .select("amount, platform_fee, status, payment_provider")
      .gte("created_at", since),
    service
      .from("orders")
      .select("status, amount")
      .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    service.from("vendors").select("id, status").eq("status", "approved"),
    service.from("platform_stats").select("*").maybeSingle(),
  ]);

  const rows30d = (orders30d.data ?? []) as {
    amount: number;
    platform_fee: number;
    status: string;
    payment_provider: string | null;
  }[];

  const gmv30d = rows30d.reduce((s, r) => s + Number(r.amount), 0);
  const platformRevenue30d = rows30d.reduce((s, r) => s + Number(r.platform_fee ?? 0), 0);

  const paymentSuccess = rows30d.filter((r) =>
    PAYMENT_SUCCESS_STATUSES.includes(r.status as (typeof PAYMENT_SUCCESS_STATUSES)[number]),
  ).length;
  const fulfilledCount = rows30d.filter((r) => r.status === "fulfilled").length;

  const paymentSuccessRate =
    rows30d.length > 0 ? Math.round((paymentSuccess / rows30d.length) * 1000) / 10 : 100;
  const fulfillmentRate =
    paymentSuccess > 0 ? Math.round((fulfilledCount / paymentSuccess) * 1000) / 10 : 100;

  const paystackCount = rows30d.filter((r) => r.payment_provider === "paystack").length;
  const paidCount = rows30d.filter((r) =>
    ["paid", "queued", "processing", "fulfilled"].includes(r.status),
  ).length;
  const paystackShare = paidCount > 0 ? Math.round((paystackCount / paidCount) * 100) : 100;

  const todayRows = (ordersToday.data ?? []) as { status: string }[];
  const ps = platformStats.data as {
    orders_today?: number;
    orders_fulfilled_today?: number;
    active_vendors?: number;
    success_rate?: number;
  } | null;

  return {
    gmv30d,
    platformRevenue30d,
    ordersToday: ps?.orders_today ?? todayRows.length,
    ordersFulfilledToday:
      ps?.orders_fulfilled_today ??
      todayRows.filter((r) => r.status === "fulfilled").length,
    activeVendors: vendorsRes.data?.length ?? ps?.active_vendors ?? 0,
    successRate: rows30d.length > 0 ? paymentSuccessRate : Number(ps?.success_rate ?? 100),
    fulfillmentRate,
    paystackShare,
  };
}

export async function fetchAdminCustomerPayments(
  limit = 100,
): Promise<AdminCustomerPaymentRow[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const { data, error } = await service
    .from("orders")
    .select(
      `
      id, reference, recipient_phone, amount, platform_fee, status, payment_provider, created_at,
      vendors!inner ( business_name, slug ),
      bundles ( name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error("[fetchAdminCustomerPayments]", error);
    return [];
  }

  return data.map((row: unknown) => {
    const r = row as {
      id: string;
      reference: string;
      recipient_phone: string;
      amount: number;
      platform_fee: number;
      status: string;
      payment_provider: string | null;
      created_at: string;
      vendors: { business_name: string; slug: string } | { business_name: string; slug: string }[];
      bundles: { name: string } | { name: string }[] | null;
    };
    const vendor = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
    const bundle = Array.isArray(r.bundles) ? r.bundles[0] : r.bundles;
    return {
      id: r.id,
      reference: r.reference,
      recipient_phone: r.recipient_phone,
      amount: Number(r.amount),
      platform_fee: Number(r.platform_fee ?? 0),
      status: r.status,
      payment_provider: r.payment_provider,
      created_at: r.created_at,
      vendor_name: vendor?.business_name ?? "—",
      vendor_slug: vendor?.slug ?? "",
      bundle_name: bundle?.name ?? null,
    };
  });
}

export async function fetchAdminTopCustomers(limit = 5): Promise<AdminTopCustomer[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const { data: orders, error } = await service
    .from("orders")
    .select("user_id, amount")
    .not("user_id", "is", null)
    .in("status", ["fulfilled", "paid", "processing", "queued"]);

  if (error || !orders?.length) return [];

  const byUser = new Map<string, { orders: number; spend: number }>();
  for (const row of orders as { user_id: string; amount: number }[]) {
    const cur = byUser.get(row.user_id) ?? { orders: 0, spend: 0 };
    cur.orders += 1;
    cur.spend += Number(row.amount);
    byUser.set(row.user_id, cur);
  }

  const sorted = [...byUser.entries()]
    .sort((a, b) => b[1].spend - a[1].spend)
    .slice(0, limit);

  const userIds = sorted.map(([id]) => id);
  const { data: profiles } = await service
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const nameMap = new Map<string, string>(
    (profiles ?? []).map((p: unknown) => {
      const row = p as { id: string; full_name: string | null; email: string };
      return [row.id, row.full_name || row.email.split("@")[0]] as const;
    }),
  );

  return sorted.map(([userId, agg]) => ({
    userId,
    name: nameMap.get(userId) ?? "Customer",
    orders: agg.orders,
    spend: agg.spend,
  }));
}

export async function fetchAdminOrderStats() {
  if (!hasSupabaseConfig()) {
    return { total: 0, fulfilled: 0, failed: 0, revenue: 0 };
  }
  const service = createServiceClient();
  // Bound the scan — full-table aggregate froze admin under load after PG cutover.
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await service
    .from("orders")
    .select("status, amount")
    .gte("created_at", since)
    .limit(50_000);
  const rows = (data ?? []) as { status: string; amount: number }[];
  return {
    total: rows.length,
    fulfilled: rows.filter((r) => r.status === "fulfilled").length,
    failed: rows.filter((r) => r.status === "failed").length,
    revenue: rows
      .filter((r) => ["fulfilled", "paid", "processing", "queued"].includes(r.status))
      .reduce((s, r) => s + Number(r.amount), 0),
  };
}
