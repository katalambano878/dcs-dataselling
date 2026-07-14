import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { fetchVendorWholesaleOrders } from "@/lib/payments/wholesale-order";

function startOfTodayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export interface VendorTodayStats {
  ordersToday: number;
  gbSoldToday: number;
  revenueToday: number;
  wholesaleSpendToday: number;
}

export interface VendorRecentOrder {
  id: string;
  reference: string;
  phone: string;
  network: string;
  amount: number;
  status: string;
  createdAt: string;
  kind: "wholesale" | "customer";
}

export interface VendorWalletMetrics {
  balance: number;
  topupsToday: number;
  profitToday: number;
  lifetimeProfit: number;
  salesToday: number;
  lifetimeSales: number;
}

export interface WalletLedgerRow {
  id: string;
  amount: number;
  entryType: string;
  reference: string | null;
  note: string | null;
  balanceAfter: number | null;
  createdAt: string;
}

export async function fetchVendorTodayStats(vendorId: string): Promise<VendorTodayStats> {
  if (!hasSupabaseConfig()) {
    return { ordersToday: 0, gbSoldToday: 0, revenueToday: 0, wholesaleSpendToday: 0 };
  }

  const service = createServiceClient();
  const since = startOfTodayIso();

  const [customerRes, wholesaleRes] = await Promise.all([
    service
      .from("orders")
      .select("id, amount, status, created_at, bundles(data_mb)")
      .eq("vendor_id", vendorId)
      .gte("created_at", since),
    service
      .from("wholesale_orders")
      .select(
        `
        id, total_amount, status, created_at,
        wholesale_order_items (
          quantity, line_total,
          wholesale_bundles ( network, data_mb )
        )
      `,
      )
      .eq("vendor_id", vendorId)
      .gte("created_at", since)
      .neq("status", "pending"),
  ]);

  const customerRows = (customerRes.data ?? []) as Array<{
    id: string;
    amount: number;
    status: string;
    bundles: { data_mb: number } | { data_mb: number }[] | null;
  }>;

  type WoRow = {
    id: string;
    total_amount: number;
    wholesale_order_items: Array<{
      quantity: number;
      wholesale_bundles: { network: string; data_mb: number } | { network: string; data_mb: number }[];
    }>;
  };

  const wholesaleRows = (wholesaleRes.data ?? []) as unknown as WoRow[];

  let gbSold = 0;
  for (const o of customerRows) {
    if (o.status !== "fulfilled" && o.status !== "paid" && o.status !== "processing") continue;
    const b = Array.isArray(o.bundles) ? o.bundles[0] : o.bundles;
    if (b?.data_mb) gbSold += b.data_mb / 1000;
  }
  for (const o of wholesaleRows) {
    for (const it of o.wholesale_order_items ?? []) {
      const wb = Array.isArray(it.wholesale_bundles)
        ? it.wholesale_bundles[0]
        : it.wholesale_bundles;
      if (wb?.data_mb) gbSold += (wb.data_mb * (it.quantity ?? 1)) / 1000;
    }
  }

  const revenueToday = customerRows
    .filter((r) => r.status === "fulfilled" || r.status === "paid")
    .reduce((s, r) => s + Number(r.amount), 0);

  const wholesaleSpendToday = wholesaleRows.reduce((s, r) => s + Number(r.total_amount), 0);

  return {
    ordersToday: customerRows.length + wholesaleRows.length,
    gbSoldToday: +gbSold.toFixed(1),
    revenueToday: +revenueToday.toFixed(2),
    wholesaleSpendToday: +wholesaleSpendToday.toFixed(2),
  };
}

export async function fetchVendorRecentOrders(
  vendorId: string,
  limit = 5,
): Promise<VendorRecentOrder[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const [customerRes, wholesaleOrders] = await Promise.all([
    service
      .from("orders")
      .select("id, reference, recipient_phone, amount, status, created_at, bundles(network)")
      .eq("vendor_id", vendorId)
      .order("created_at", { ascending: false })
      .limit(limit),
    fetchVendorWholesaleOrders(vendorId, limit),
  ]);

  const customer = (customerRes.data ?? []).map((r) => {
    const row = r as {
      id: string;
      reference: string;
      recipient_phone: string;
      amount: number;
      status: string;
      created_at: string;
      bundles: { network: string } | { network: string }[] | null;
    };
    const b = Array.isArray(row.bundles) ? row.bundles[0] : row.bundles;
    return {
      id: row.id,
      reference: row.reference,
      phone: row.recipient_phone,
      network: (b?.network ?? "mtn").toUpperCase(),
      amount: Number(row.amount),
      status: row.status,
      createdAt: row.created_at,
      kind: "customer" as const,
    };
  });

  const wholesale = wholesaleOrders.flatMap((o) =>
    o.items.slice(0, 1).map((it) => ({
      id: `${o.id}-${it.id}`,
      reference: o.reference,
      phone: it.phone,
      network: it.network.toUpperCase(),
      amount: it.lineTotal,
      status: it.status,
      createdAt: o.createdAt,
      kind: "wholesale" as const,
    })),
  );

  return [...customer, ...wholesale]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export async function fetchVendorWalletMetrics(vendorId: string): Promise<VendorWalletMetrics> {
  if (!hasSupabaseConfig()) {
    return {
      balance: 0,
      topupsToday: 0,
      profitToday: 0,
      lifetimeProfit: 0,
      salesToday: 0,
      lifetimeSales: 0,
    };
  }

  const service = createServiceClient();
  const since = startOfTodayIso();

  const [walletRes, topupsTodayRes, topupsAllRes, customerAll, customerToday, wholesaleToday] =
    await Promise.all([
      service.from("wallets").select("balance").eq("vendor_id", vendorId).maybeSingle(),
      service
        .from("wallet_topups")
        .select("amount")
        .eq("vendor_id", vendorId)
        .eq("status", "paid")
        .gte("paid_at", since),
      service
        .from("wallet_topups")
        .select("amount")
        .eq("vendor_id", vendorId)
        .eq("status", "paid"),
      service
        .from("orders")
        .select("amount, status")
        .eq("vendor_id", vendorId)
        .in("status", ["fulfilled", "paid"]),
      service
        .from("orders")
        .select("amount, status")
        .eq("vendor_id", vendorId)
        .gte("created_at", since)
        .in("status", ["fulfilled", "paid"]),
      service
        .from("wholesale_orders")
        .select("total_amount")
        .eq("vendor_id", vendorId)
        .gte("created_at", since)
        .neq("status", "pending"),
    ]);

  const balance = Number((walletRes.data as { balance: number } | null)?.balance ?? 0);
  const topupsToday = ((topupsTodayRes.data ?? []) as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );
  const lifetimeTopups = ((topupsAllRes.data ?? []) as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );

  const salesToday = ((customerToday.data ?? []) as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );
  const lifetimeSales = ((customerAll.data ?? []) as { amount: number }[]).reduce(
    (s, r) => s + Number(r.amount),
    0,
  );

  const wholesaleSpendToday = ((wholesaleToday.data ?? []) as { total_amount: number }[]).reduce(
    (s, r) => s + Number(r.total_amount),
    0,
  );

  const profitToday = +(salesToday - wholesaleSpendToday).toFixed(2);
  const lifetimeWholesale = await service
    .from("wholesale_orders")
    .select("total_amount")
    .eq("vendor_id", vendorId)
    .neq("status", "pending");

  const lifetimeWholesaleSpend = ((lifetimeWholesale.data ?? []) as { total_amount: number }[]).reduce(
    (s, r) => s + Number(r.total_amount),
    0,
  );

  return {
    balance,
    topupsToday: +topupsToday.toFixed(2),
    profitToday,
    lifetimeProfit: +(lifetimeSales - lifetimeWholesaleSpend).toFixed(2),
    salesToday: +salesToday.toFixed(2),
    lifetimeSales: +lifetimeSales.toFixed(2),
  };
}

export async function fetchVendorWalletLedger(
  vendorId: string,
  limit = 100,
): Promise<WalletLedgerRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("wallet_ledger")
    .select("id, amount, entry_type, reference, note, balance_after, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<{
    id: string;
    amount: number;
    entry_type: string;
    reference: string | null;
    note: string | null;
    balance_after: number | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    amount: Number(r.amount),
    entryType: r.entry_type,
    reference: r.reference,
    note: r.note,
    balanceAfter: r.balance_after != null ? Number(r.balance_after) : null,
    createdAt: r.created_at,
  }));
}
