import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export interface ConsoleDashboardStats {
  balanceMb: number;
  totalSends: number;
  sentTodayCount: number;
  sentTodayMb: number;
  enabled: boolean;
}

function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export async function fetchConsoleDashboardStats(vendorId: string): Promise<ConsoleDashboardStats | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("balance_mb, total_sends, enabled")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (!acct) return null;

  const row = acct as { balance_mb: number; total_sends: number; enabled: boolean };
  const todayStart = startOfTodayIso();

  const { data: todayRows } = await service
    .from("console_send_ledger")
    .select("amount_mb")
    .eq("vendor_id", vendorId)
    .eq("status", "completed")
    .gte("created_at", todayStart);

  const sends = (todayRows ?? []) as { amount_mb: number }[];
  const sentTodayMb = sends.reduce((s, r) => s + Number(r.amount_mb), 0);

  return {
    balanceMb: Number(row.balance_mb),
    totalSends: row.total_sends,
    sentTodayCount: sends.length,
    sentTodayMb: +sentTodayMb.toFixed(2),
    enabled: row.enabled,
  };
}
