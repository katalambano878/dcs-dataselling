import "server-only";

import type { NetworkId } from "@/lib/constants";
import {
  generateMomoOrderReference,
  findSmsByTransactionId,
} from "@/lib/payments/momo-direct";
import {
  creditVendorWallet,
  getVendorNotifyPhone,
  type WalletTopupCompletion,
} from "@/lib/payments/wallet";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

interface PendingMomoTopup {
  id: string;
  vendor_id: string;
  reference: string;
  amount: number;
  status: string;
  payment_reference: string | null;
}

function withinAmountTolerance(expected: number, received: number): boolean {
  return received + 0.01 >= expected;
}

/** Credit the MoMo SMS amount when it is at least the declared top-up (handles overpayment). */
function resolveCreditAmount(declaredAmount: number, smsAmount: number | null): number | "underpaid" {
  if (smsAmount == null) return declaredAmount;
  if (smsAmount + 0.01 < declaredAmount) return "underpaid";
  return smsAmount;
}

export async function createMomoWalletTopup(vendorId: string, amount: number) {
  if (!hasSupabaseConfig()) throw new Error("Database not configured");
  const service = createServiceClient();
  const reference = generateMomoOrderReference();

  const { data, error } = await service
    .from("wallet_topups")
    .insert({
      vendor_id: vendorId,
      reference,
      amount,
      status: "pending",
      payment_method: "momo_direct",
    })
    .select("id, reference, amount")
    .single();

  if (error || !data) throw new Error("Could not create payment code");
  return data as { id: string; reference: string; amount: number };
}

export async function linkSmsToWalletTopup(smsId: string, topupId: string): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const service = createServiceClient();
  await service
    .from("momo_sms")
    .update({
      matched_wallet_topup_id: topupId,
      matched_at: new Date().toISOString(),
    })
    .eq("id", smsId)
    .is("matched_wallet_topup_id", null)
    .is("matched_order_id", null);
}

export async function finalizeMomoWalletTopup(
  topupId: string,
  transactionId: string,
  /** When set, credits this amount (from the MoMo SMS) instead of the declared top-up amount. */
  smsAmount?: number | null,
): Promise<WalletTopupCompletion | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: topup } = await service
    .from("wallet_topups")
    .select("id, vendor_id, reference, amount, status, payment_method")
    .eq("id", topupId)
    .maybeSingle();

  const t = topup as PendingMomoTopup & { payment_method: string } | null;
  if (!t || t.status !== "pending" || t.payment_method !== "momo_direct") return null;

  const declared = Number(t.amount);
  const creditResolution = resolveCreditAmount(declared, smsAmount ?? null);
  if (creditResolution === "underpaid") return null;
  const amountToCredit = creditResolution;

  const { error: updateError } = await service
    .from("wallet_topups")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: transactionId.trim().toUpperCase(),
      amount: amountToCredit,
    })
    .eq("id", t.id)
    .eq("status", "pending");

  if (updateError) return null;

  await creditVendorWallet(
    t.vendor_id,
    amountToCredit,
    "topup",
    t.reference,
    "MoMo wallet top-up",
  );

  const notifyPhone = await getVendorNotifyPhone(t.vendor_id);

  return {
    vendorId: t.vendor_id,
    amount: amountToCredit,
    reference: t.reference,
    notifyPhone,
  };
}

/**
 * Auto-match a forwarded MoMo SMS to a pending wallet top-up (ClaimIt).
 * Precedence: reference hint → pre-submitted transaction id on topup.
 */
export async function autoMatchWalletTopupForSms(smsId: string): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: sms } = await service
    .from("momo_sms")
    .select(
      "id, transaction_id, amount, reference_hint, raw_body, matched_order_id, matched_wallet_topup_id",
    )
    .eq("id", smsId)
    .maybeSingle();

  const row = sms as {
    id: string;
    transaction_id: string | null;
    amount: number | string | null;
    reference_hint: string | null;
    raw_body: string;
    matched_order_id: string | null;
    matched_wallet_topup_id: string | null;
  } | null;

  if (!row || row.matched_order_id || row.matched_wallet_topup_id) {
    return row?.matched_wallet_topup_id ?? null;
  }

  const amount = row.amount != null ? Number(row.amount) : null;
  const referenceCandidates = [
    row.reference_hint?.trim().toUpperCase(),
    row.raw_body.match(/\b(DCS-[A-Z0-9]{4,12})\b/i)?.[1]?.toUpperCase(),
  ].filter((v): v is string => Boolean(v));

  for (const hint of referenceCandidates) {
    const { data } = await service
      .from("wallet_topups")
      .select("id, amount")
      .eq("reference", hint)
      .eq("status", "pending")
      .eq("payment_method", "momo_direct")
      .maybeSingle();

    const topup = data as { id: string; amount: number | string } | null;
    if (topup && (amount == null || withinAmountTolerance(Number(topup.amount), amount))) {
      await linkSmsToWalletTopup(row.id, topup.id);
      return topup.id;
    }
  }

  if (row.transaction_id) {
    const { data } = await service
      .from("wallet_topups")
      .select("id, amount")
      .eq("payment_reference", row.transaction_id)
      .eq("status", "pending")
      .eq("payment_method", "momo_direct")
      .maybeSingle();

    const topup = data as { id: string; amount: number | string } | null;
    if (topup && (amount == null || withinAmountTolerance(Number(topup.amount), amount))) {
      await linkSmsToWalletTopup(row.id, topup.id);
      return topup.id;
    }
  }

  return null;
}

async function findPendingTopupForVendor(
  vendorId: string,
  reference?: string,
): Promise<PendingMomoTopup | null> {
  const service = createServiceClient();

  if (reference) {
    const { data } = await service
      .from("wallet_topups")
      .select("id, vendor_id, reference, amount, status, payment_reference")
      .eq("vendor_id", vendorId)
      .eq("reference", reference.trim().toUpperCase())
      .eq("status", "pending")
      .eq("payment_method", "momo_direct")
      .maybeSingle();
    return (data as PendingMomoTopup | null) ?? null;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await service
    .from("wallet_topups")
    .select("id, vendor_id, reference, amount, status, payment_reference")
    .eq("vendor_id", vendorId)
    .eq("status", "pending")
    .eq("payment_method", "momo_direct")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as PendingMomoTopup | null) ?? null;
}

export type WalletMomoClaimStatus = "paid" | "waiting" | "amount_mismatch" | "already_processed";

export async function claimMomoWalletTopup(params: {
  vendorId: string;
  transactionId: string;
  reference?: string;
}): Promise<{
  status: WalletMomoClaimStatus;
  amount?: number;
  reference?: string;
  orderAmount?: number;
  smsAmount?: number;
}> {
  if (!hasSupabaseConfig()) throw new Error("Database not configured");

  const txnId = params.transactionId.trim().toUpperCase();
  const service = createServiceClient();

  let topup = await findPendingTopupForVendor(params.vendorId, params.reference);

  const sms = await findSmsByTransactionId(txnId);

  if (sms?.matched_wallet_topup_id) {
    const { data: linked } = await service
      .from("wallet_topups")
      .select("vendor_id, status")
      .eq("id", sms.matched_wallet_topup_id)
      .maybeSingle();
    const linkedTopup = linked as { vendor_id: string; status: string } | null;
    if (linkedTopup?.vendor_id === params.vendorId && linkedTopup.status === "paid") {
      return { status: "already_processed" };
    }
    if (linkedTopup && linkedTopup.vendor_id !== params.vendorId) {
      return { status: "already_processed" };
    }
  }

  if (sms?.matched_order_id) {
    return { status: "already_processed" };
  }

  if (!topup && sms?.amount != null) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await service
      .from("wallet_topups")
      .select("id, vendor_id, reference, amount, status, payment_reference")
      .eq("vendor_id", params.vendorId)
      .eq("status", "pending")
      .eq("payment_method", "momo_direct")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    const pending = (data ?? []) as PendingMomoTopup[];
    topup =
      pending.find((p) => withinAmountTolerance(Number(p.amount), Number(sms.amount))) ?? null;
  }

  if (!topup && sms?.amount != null) {
    const created = await createMomoWalletTopup(params.vendorId, Number(sms.amount));
    topup = {
      id: created.id,
      vendor_id: params.vendorId,
      reference: created.reference,
      amount: created.amount,
      status: "pending",
      payment_reference: null,
    };
  }

  if (!topup) {
    if (params.reference) {
      await service
        .from("wallet_topups")
        .update({ payment_reference: txnId })
        .eq("vendor_id", params.vendorId)
        .eq("reference", params.reference.trim().toUpperCase())
        .eq("status", "pending")
        .eq("payment_method", "momo_direct");
    }
    return { status: "waiting" };
  }

  await service
    .from("wallet_topups")
    .update({ payment_reference: txnId })
    .eq("id", topup.id);

  if (!sms) {
    return { status: "waiting", reference: topup.reference, amount: Number(topup.amount) };
  }

  const smsAmount = sms.amount != null ? Number(sms.amount) : null;
  const topupAmount = Number(topup.amount);
  const creditResolution = resolveCreditAmount(topupAmount, smsAmount);
  if (creditResolution === "underpaid") {
    return {
      status: "amount_mismatch",
      orderAmount: topupAmount,
      smsAmount: smsAmount ?? undefined,
      reference: topup.reference,
    };
  }

  await linkSmsToWalletTopup(sms.id, topup.id);
  const result = await finalizeMomoWalletTopup(topup.id, txnId, smsAmount);
  if (!result) return { status: "already_processed" };

  return {
    status: "paid",
    amount: result.amount,
    reference: result.reference,
  };
}

export function primaryMerchantNumber(numbers: Record<NetworkId, string>): string {
  return numbers.mtn || numbers.telecel || numbers.at || "";
}
