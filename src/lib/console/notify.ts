import "server-only";

import { sendArkeselSms } from "@/lib/notifications/arkesel";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { formatConsoleData } from "@/lib/console/units";

async function vendorPhone(vendorId: string): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();
  const { data: vendor } = await service
    .from("vendors")
    .select("user_id, whatsapp_number, momo_number")
    .eq("id", vendorId)
    .maybeSingle();
  if (!vendor) return null;

  const v = vendor as { user_id: string; whatsapp_number: string | null; momo_number: string | null };
  const { data: profile } = await service
    .from("profiles")
    .select("phone")
    .eq("id", v.user_id)
    .maybeSingle();

  const phone = (profile as { phone: string | null } | null)?.phone ?? v.momo_number ?? v.whatsapp_number;
  return phone?.trim() || null;
}

export async function notifyConsoleCreditLoaded(params: {
  vendorId: string;
  amountMb: number;
  balanceAfterMb: number;
}): Promise<void> {
  const phone = await vendorPhone(params.vendorId);
  if (!phone) return;

  const msg = `DCS Data Console: ${formatConsoleData(params.amountMb)} credit loaded. New balance: ${formatConsoleData(params.balanceAfterMb)}. console.dcselite.com`;
  await sendArkeselSms([phone], msg, {
    template: "console_credit_loaded",
    context: { vendorId: params.vendorId, amountMb: params.amountMb },
  }).catch(() => undefined);
}

export async function maybeNotifyConsoleLowBalance(params: {
  vendorId: string;
  balanceMb: number;
}): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const service = createServiceClient();

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("low_balance_threshold_mb, last_low_balance_alert_at")
    .eq("vendor_id", params.vendorId)
    .maybeSingle();

  const row = acct as {
    low_balance_threshold_mb: number;
    last_low_balance_alert_at: string | null;
  } | null;

  if (!row) return;
  const threshold = Number(row.low_balance_threshold_mb);
  if (params.balanceMb > threshold) return;

  const last = row.last_low_balance_alert_at ? new Date(row.last_low_balance_alert_at).getTime() : 0;
  if (Date.now() - last < 24 * 60 * 60 * 1000) return;

  const phone = await vendorPhone(params.vendorId);
  if (!phone) return;

  const msg = `DCS Data Console: Low balance warning — ${formatConsoleData(params.balanceMb)} left. Contact admin to top up.`;
  const sent = await sendArkeselSms([phone], msg, {
    template: "console_low_balance",
    context: { vendorId: params.vendorId, balanceMb: params.balanceMb },
  }).catch(() => null);
  if (sent?.ok) {
    await service
      .from("vendor_console_accounts")
      .update({ last_low_balance_alert_at: new Date().toISOString() })
      .eq("vendor_id", params.vendorId);
  }
}
