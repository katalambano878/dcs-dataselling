import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export interface AdminPromoCodeRow {
  id: string;
  code: string;
  amount: number;
  max_redemptions: number | null;
  redemption_count: number;
  active: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface AdminRewardWithdrawalRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  amount: number;
  momo_number: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AdminComplaintRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  subject: string | null;
  message: string;
  status: string;
  admin_reply: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminMtnAfaRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  agent_id: string;
  status: string;
  admin_note: string | null;
  submitted_at: string;
  verified_at: string | null;
}

export interface AdminVendorApiKeyRow {
  id: string;
  vendor_id: string;
  vendor_name: string;
  name: string;
  key_prefix: string;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export interface AdminAgentOpsSummary {
  pendingWithdrawals: number;
  openComplaints: number;
  pendingMtnAfa: number;
  pendingMomoWalletClaims: number;
  activeApiKeys: number;
}

function vendorName(
  vendors: { business_name: string } | { business_name: string }[] | null,
): string {
  if (!vendors) return "Vendor";
  return Array.isArray(vendors) ? (vendors[0]?.business_name ?? "Vendor") : vendors.business_name;
}

export async function fetchAdminAgentOpsSummary(): Promise<AdminAgentOpsSummary> {
  if (!hasSupabaseConfig()) {
    return {
      pendingWithdrawals: 0,
      openComplaints: 0,
      pendingMtnAfa: 0,
      pendingMomoWalletClaims: 0,
      activeApiKeys: 0,
    };
  }

  const service = createServiceClient();
  const [withdrawals, complaints, afa, momoClaims, keys] = await Promise.all([
    service.from("reward_withdrawals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    service
      .from("vendor_complaints")
      .select("id", { count: "exact", head: true })
      .in("status", ["open", "in_progress"]),
    service.from("vendor_mtn_afa").select("id", { count: "exact", head: true }).eq("status", "pending"),
    service
      .from("wallet_topups")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .eq("payment_method", "momo_direct"),
    service.from("vendor_api_keys").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  return {
    pendingWithdrawals: withdrawals.count ?? 0,
    openComplaints: complaints.count ?? 0,
    pendingMtnAfa: afa.count ?? 0,
    pendingMomoWalletClaims: momoClaims.count ?? 0,
    activeApiKeys: keys.count ?? 0,
  };
}

export async function fetchAdminPromoCodes(): Promise<AdminPromoCodeRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("promo_codes")
    .select("id, code, amount, max_redemptions, redemption_count, active, expires_at, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as AdminPromoCodeRow[];
}

export async function fetchAdminRewardWithdrawals(): Promise<AdminRewardWithdrawalRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("reward_withdrawals")
    .select(
      `
      id, vendor_id, amount, momo_number, status, admin_note, created_at, processed_at,
      vendors!inner ( business_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      vendor_id: string;
      amount: number;
      momo_number: string;
      status: string;
      admin_note: string | null;
      created_at: string;
      processed_at: string | null;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: vendorName(r.vendors),
      amount: Number(r.amount),
      momo_number: r.momo_number,
      status: r.status,
      admin_note: r.admin_note,
      created_at: r.created_at,
      processed_at: r.processed_at,
    };
  });
}

export async function fetchAdminVendorComplaints(): Promise<AdminComplaintRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("vendor_complaints")
    .select(
      `
      id, vendor_id, subject, message, status, admin_reply, created_at, updated_at,
      vendors!inner ( business_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      vendor_id: string;
      subject: string | null;
      message: string;
      status: string;
      admin_reply: string | null;
      created_at: string;
      updated_at: string;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: vendorName(r.vendors),
      subject: r.subject,
      message: r.message,
      status: r.status,
      admin_reply: r.admin_reply,
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
  });
}

export async function fetchAdminMtnAfaApplications(): Promise<AdminMtnAfaRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("vendor_mtn_afa")
    .select(
      `
      id, vendor_id, agent_id, status, admin_note, submitted_at, verified_at,
      vendors!inner ( business_name )
    `,
    )
    .order("submitted_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      vendor_id: string;
      agent_id: string;
      status: string;
      admin_note: string | null;
      submitted_at: string;
      verified_at: string | null;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: vendorName(r.vendors),
      agent_id: r.agent_id,
      status: r.status,
      admin_note: r.admin_note,
      submitted_at: r.submitted_at,
      verified_at: r.verified_at,
    };
  });
}

export async function fetchAdminVendorApiKeys(): Promise<AdminVendorApiKeyRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("vendor_api_keys")
    .select(
      `
      id, vendor_id, name, key_prefix, active, last_used_at, created_at,
      vendors!inner ( business_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(100);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      vendor_id: string;
      name: string;
      key_prefix: string;
      active: boolean;
      last_used_at: string | null;
      created_at: string;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      vendor_id: r.vendor_id,
      vendor_name: vendorName(r.vendors),
      name: r.name,
      key_prefix: r.key_prefix,
      active: r.active,
      last_used_at: r.last_used_at,
      created_at: r.created_at,
    };
  });
}

export interface AdminWalletLedgerRow {
  id: string;
  vendor_name: string;
  amount: number;
  entry_type: string;
  reference: string | null;
  note: string | null;
  balance_after: number | null;
  created_at: string;
}

export interface AdminAgentRewardRow {
  id: string;
  vendor_name: string;
  reward_balance: number;
  wallet_balance: number;
}

export interface AdminWholesaleOrderRow {
  id: string;
  reference: string;
  vendor_name: string;
  status: string;
  total_amount: number;
  item_count: number;
  source: string;
  created_at: string;
}

export async function fetchAdminWalletLedger(limit = 100): Promise<AdminWalletLedgerRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("wallet_ledger")
    .select(
      `
      id, amount, entry_type, reference, note, balance_after, created_at,
      vendors!inner ( business_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      amount: number;
      entry_type: string;
      reference: string | null;
      note: string | null;
      balance_after: number | null;
      created_at: string;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      vendor_name: vendorName(r.vendors),
      amount: Number(r.amount),
      entry_type: r.entry_type,
      reference: r.reference,
      note: r.note,
      balance_after: r.balance_after != null ? Number(r.balance_after) : null,
      created_at: r.created_at,
    };
  });
}

export async function fetchAdminAgentRewardBalances(): Promise<AdminAgentRewardRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("vendors")
    .select(
      `
      id, business_name, reward_balance,
      wallets ( balance )
    `,
    )
    .order("reward_balance", { ascending: false })
    .limit(50);

  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const r = row as {
        id: string;
        business_name: string;
        reward_balance: number;
        wallets: { balance: number } | { balance: number }[] | null;
      };
      const wallet = Array.isArray(r.wallets) ? r.wallets[0] : r.wallets;
      return {
        id: r.id,
        vendor_name: r.business_name,
        reward_balance: Number(r.reward_balance),
        wallet_balance: Number(wallet?.balance ?? 0),
      };
    })
    .filter((r: AdminAgentRewardRow) => r.reward_balance > 0 || r.wallet_balance > 0);
}

export async function fetchAdminWholesaleOrders(limit = 50): Promise<AdminWholesaleOrderRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("wholesale_orders")
    .select(
      `
      id, reference, status, total_amount, item_count, source, created_at,
      vendors!inner ( business_name )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row: Record<string, unknown>) => {
    const r = row as {
      id: string;
      reference: string;
      status: string;
      total_amount: number;
      item_count: number;
      source: string;
      created_at: string;
      vendors: { business_name: string } | { business_name: string }[];
    };
    return {
      id: r.id,
      reference: r.reference,
      vendor_name: vendorName(r.vendors),
      status: r.status,
      total_amount: Number(r.total_amount),
      item_count: r.item_count,
      source: r.source,
      created_at: r.created_at,
    };
  });
}
