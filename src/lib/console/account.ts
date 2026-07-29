import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { notifyConsoleCreditLoaded } from "@/lib/console/notify";
import {
  generateConsoleCreditReference,
  generateConsoleDebitReference,
} from "@/lib/console/units";

export interface VendorConsoleAccount {
  vendorId: string;
  enabled: boolean;
  balanceMb: number;
  totalSends: number;
  createdAt: string;
  updatedAt: string;
}

function rowToAccount(row: {
  vendor_id: string;
  enabled: boolean;
  balance_mb: number | string;
  total_sends: number;
  created_at: string;
  updated_at: string;
}): VendorConsoleAccount {
  return {
    vendorId: row.vendor_id,
    enabled: row.enabled,
    balanceMb: Number(row.balance_mb),
    totalSends: row.total_sends,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getOrCreateConsoleAccount(vendorId: string): Promise<VendorConsoleAccount | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: existing } = await service
    .from("vendor_console_accounts")
    .select("vendor_id, enabled, balance_mb, total_sends, created_at, updated_at")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (existing) return rowToAccount(existing as Parameters<typeof rowToAccount>[0]);

  const { data: created, error } = await service
    .from("vendor_console_accounts")
    .insert({ vendor_id: vendorId, enabled: false, balance_mb: 0 })
    .select("vendor_id, enabled, balance_mb, total_sends, created_at, updated_at")
    .single();

  if (error || !created) return null;
  return rowToAccount(created as Parameters<typeof rowToAccount>[0]);
}

export async function setConsoleEnabled(vendorId: string, enabled: boolean): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  await getOrCreateConsoleAccount(vendorId);
  const service = createServiceClient();
  const { error } = await service
    .from("vendor_console_accounts")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId);
  return !error;
}

export type AllocateConsoleCreditResult =
  | { ok: true; amountMb: number; balanceAfterMb: number; reference: string }
  | { ok: false; error: string };

export async function allocateConsoleCredit(params: {
  vendorId: string;
  amountMb: number;
  note?: string;
  createdBy?: string;
  reference?: string;
}): Promise<AllocateConsoleCreditResult> {
  if (!hasSupabaseConfig()) return { ok: false, error: "Not configured" };
  if (params.amountMb <= 0) return { ok: false, error: "Amount must be positive" };

  const service = createServiceClient();
  await getOrCreateConsoleAccount(params.vendorId);

  const reference = params.reference ?? generateConsoleCreditReference();

  const { data: dup } = await service
    .from("console_credit_ledger")
    .select("id")
    .eq("vendor_id", params.vendorId)
    .eq("reference", reference)
    .maybeSingle();
  if (dup) return { ok: false, error: "Duplicate credit reference" };

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("balance_mb, enabled")
    .eq("vendor_id", params.vendorId)
    .single();

  const current = Number((acct as { balance_mb: number } | null)?.balance_mb ?? 0);
  const next = +(current + params.amountMb).toFixed(2);

  const { error: ledgerErr } = await service.from("console_credit_ledger").insert({
    vendor_id: params.vendorId,
    amount_mb: params.amountMb,
    balance_after_mb: next,
    reference,
    note: params.note ?? null,
    created_by: params.createdBy ?? null,
  });

  if (ledgerErr) return { ok: false, error: ledgerErr.message };

  const { error: updErr } = await service
    .from("vendor_console_accounts")
    .update({
      balance_mb: next,
      enabled: true,
      updated_at: new Date().toISOString(),
    })
    .eq("vendor_id", params.vendorId);

  if (updErr) return { ok: false, error: updErr.message };

  void notifyConsoleCreditLoaded({
    vendorId: params.vendorId,
    amountMb: params.amountMb,
    balanceAfterMb: next,
  });

  return { ok: true, amountMb: params.amountMb, balanceAfterMb: next, reference };
}

/**
 * Admin correction: remove wrongly allocated GB from a console account.
 * Writes a negative ledger row; does not count as a send.
 */
export type DebitConsoleCreditResult =
  | { ok: true; amountMb: number; balanceAfterMb: number; reference: string }
  | { ok: false; error: string };

export async function debitConsoleCredit(params: {
  vendorId: string;
  amountMb: number;
  note?: string;
  createdBy?: string;
  reference?: string;
}): Promise<DebitConsoleCreditResult> {
  if (!hasSupabaseConfig()) return { ok: false, error: "Not configured" };
  if (params.amountMb <= 0) return { ok: false, error: "Amount must be positive" };

  const service = createServiceClient();
  await getOrCreateConsoleAccount(params.vendorId);

  const reference = params.reference ?? generateConsoleDebitReference();

  const { data: dup } = await service
    .from("console_credit_ledger")
    .select("id")
    .eq("vendor_id", params.vendorId)
    .eq("reference", reference)
    .maybeSingle();
  if (dup) return { ok: false, error: "Duplicate debit reference" };

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("balance_mb")
    .eq("vendor_id", params.vendorId)
    .single();

  const current = Number((acct as { balance_mb: number } | null)?.balance_mb ?? 0);
  if (current < params.amountMb) {
    return {
      ok: false,
      error: `Insufficient console balance (have ${current}MB, trying to debit ${params.amountMb}MB)`,
    };
  }

  const next = +(current - params.amountMb).toFixed(2);
  const note =
    params.note?.trim() ||
    `Admin debit correction (−${params.amountMb}MB)`;

  const { error: ledgerErr } = await service.from("console_credit_ledger").insert({
    vendor_id: params.vendorId,
    amount_mb: -params.amountMb,
    balance_after_mb: next,
    reference,
    note,
    created_by: params.createdBy ?? null,
  });

  if (ledgerErr) return { ok: false, error: ledgerErr.message };

  const { data: updated, error: updErr } = await service
    .from("vendor_console_accounts")
    .update({
      balance_mb: next,
      updated_at: new Date().toISOString(),
    })
    .eq("vendor_id", params.vendorId)
    .gte("balance_mb", params.amountMb)
    .select("balance_mb")
    .maybeSingle();

  if (updErr || !updated) {
    return { ok: false, error: updErr?.message ?? "Could not debit console balance" };
  }

  return {
    ok: true,
    amountMb: params.amountMb,
    balanceAfterMb: Number((updated as { balance_mb: number }).balance_mb),
    reference,
  };
}

export async function debitConsoleBalance(
  vendorId: string,
  amountMb: number,
): Promise<{ ok: true; balanceAfterMb: number } | { ok: false; error: string }> {
  if (!hasSupabaseConfig()) return { ok: false, error: "Not configured" };
  const service = createServiceClient();

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("balance_mb, enabled, total_sends")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  const row = acct as { balance_mb: number; enabled: boolean; total_sends: number } | null;
  if (!row?.enabled) return { ok: false, error: "Console not enabled for this account" };

  const current = Number(row.balance_mb);
  if (current < amountMb) {
    return { ok: false, error: `Insufficient data balance (have ${current}MB, need ${amountMb}MB)` };
  }

  const next = +(current - amountMb).toFixed(2);

  const { data: updated, error } = await service
    .from("vendor_console_accounts")
    .update({
      balance_mb: next,
      total_sends: (row.total_sends ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("vendor_id", vendorId)
    .gte("balance_mb", amountMb)
    .select("balance_mb")
    .maybeSingle();

  if (error || !updated) {
    return { ok: false, error: "Could not debit console balance" };
  }

  return { ok: true, balanceAfterMb: Number((updated as { balance_mb: number }).balance_mb) };
}

export async function creditConsoleBalance(
  vendorId: string,
  amountMb: number,
): Promise<number | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: acct } = await service
    .from("vendor_console_accounts")
    .select("balance_mb")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  const current = Number((acct as { balance_mb: number } | null)?.balance_mb ?? 0);
  const next = +(current + amountMb).toFixed(2);

  await service
    .from("vendor_console_accounts")
    .update({ balance_mb: next, updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId);

  return next;
}
