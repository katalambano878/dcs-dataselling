import "server-only";
import { SITE } from "@/lib/constants";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export function generateAdminWalletReference(kind: "credit" | "debit") {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DCS-ADMIN-${kind.toUpperCase()}-${date}-${rand}`;
}

/** Resolve best phone for wallet SMS (profile → MoMo → WhatsApp). */
export async function getVendorNotifyPhone(vendorId: string): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();
  const { data: vendor } = await service
    .from("vendors")
    .select("user_id, momo_number, whatsapp_number")
    .eq("id", vendorId)
    .maybeSingle();

  const v = vendor as {
    user_id: string;
    momo_number: string | null;
    whatsapp_number: string | null;
  } | null;
  if (!v) return null;

  const { data: profile } = await service
    .from("profiles")
    .select("phone")
    .eq("id", v.user_id)
    .maybeSingle();

  const phone = (profile as { phone: string | null } | null)?.phone;
  return phone ?? v.momo_number ?? v.whatsapp_number ?? null;
}

export function generateWalletTopupReference() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DCS-WALLET-${date}-${rand}`;
}

export async function getOrCreateVendorWallet(vendorId: string) {
  if (!hasSupabaseConfig()) return { balance: 0, pendingBalance: 0 };

  const service = createServiceClient();
  const { data: existing } = await service
    .from("wallets")
    .select("id, balance, pending_balance")
    .eq("vendor_id", vendorId)
    .maybeSingle();

  if (existing) {
    const row = existing as { balance: number; pending_balance: number };
    return {
      balance: Number(row.balance),
      pendingBalance: Number(row.pending_balance),
    };
  }

  const { data: created } = await service
    .from("wallets")
    .insert({ vendor_id: vendorId, balance: 0, pending_balance: 0 })
    .select("balance, pending_balance")
    .single();

  const row = created as { balance: number; pending_balance: number } | null;
  return {
    balance: Number(row?.balance ?? 0),
    pendingBalance: Number(row?.pending_balance ?? 0),
  };
}

export async function createWalletTopup(vendorId: string, amount: number) {
  const service = createServiceClient();
  const reference = generateWalletTopupReference();

  const { data, error } = await service
    .from("wallet_topups")
    .insert({
      vendor_id: vendorId,
      reference,
      amount,
      status: "pending",
    })
    .select("id, reference, amount")
    .single();

  if (error || !data) throw new Error("Could not create top-up");
  return data as { id: string; reference: string; amount: number };
}

export async function initializeWalletTopupPaystack(params: {
  email: string;
  vendorId: string;
  reference: string;
  amount: number;
}) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return null;

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: Math.round(params.amount * 100),
      currency: "GHS",
      reference: params.reference,
      metadata: {
        type: "wallet_topup",
        vendor_id: params.vendorId,
      },
      channels: ["mobile_money", "card"],
      callback_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? SITE.url}/vendor/dashboard/wallet?topup=1&ref=${params.reference}`,
    }),
  });

  const data = await res.json();
  if (data.status && data.data?.authorization_url) {
    return data.data.authorization_url as string;
  }
  return null;
}

export interface WalletTopupCompletion {
  vendorId: string;
  amount: number;
  reference: string;
  /** Best-effort vendor phone for SMS notification (momo number or whatsapp). */
  notifyPhone: string | null;
}

export async function markWalletTopupPaid(
  reference: string,
  paymentReference: string,
): Promise<WalletTopupCompletion | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: topup } = await service
    .from("wallet_topups")
    .select("id, vendor_id, amount, status")
    .eq("reference", reference)
    .maybeSingle();

  const t = topup as {
    id: string;
    vendor_id: string;
    amount: number;
    status: string;
  } | null;

  if (!t || t.status !== "pending") return null;

  await service
    .from("wallet_topups")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: paymentReference,
    })
    .eq("id", t.id);

  await creditVendorWallet(t.vendor_id, Number(t.amount), "topup", reference, "Wallet top-up");

  const { data: vendor } = await service
    .from("vendors")
    .select("momo_number, whatsapp_number")
    .eq("id", t.vendor_id)
    .maybeSingle();

  const v = vendor as { momo_number: string | null; whatsapp_number: string | null } | null;

  return {
    vendorId: t.vendor_id,
    amount: Number(t.amount),
    reference,
    notifyPhone: v?.momo_number ?? v?.whatsapp_number ?? null,
  };
}

export async function creditVendorWallet(
  vendorId: string,
  amount: number,
  entryType: "topup" | "refund" | "adjustment",
  reference: string,
  note?: string,
) {
  const service = createServiceClient();
  await getOrCreateVendorWallet(vendorId);

  const { data: wallet } = await service
    .from("wallets")
    .select("balance")
    .eq("vendor_id", vendorId)
    .single();

  const current = Number((wallet as { balance: number }).balance);
  const next = +(current + amount).toFixed(2);

  await service.from("wallets").update({ balance: next, updated_at: new Date().toISOString() }).eq("vendor_id", vendorId);

  await service.from("wallet_ledger").insert({
    vendor_id: vendorId,
    amount,
    entry_type: entryType,
    reference,
    note,
    balance_after: next,
  });
}

export async function debitVendorWallet(
  vendorId: string,
  amount: number,
  reference: string,
  note?: string,
  entryType: "order_debit" | "adjustment" = "order_debit",
): Promise<boolean> {
  const service = createServiceClient();
  await getOrCreateVendorWallet(vendorId);

  const { data: wallet } = await service
    .from("wallets")
    .select("balance")
    .eq("vendor_id", vendorId)
    .single();

  const current = Number((wallet as { balance: number }).balance);
  if (current < amount) return false;

  const next = +(current - amount).toFixed(2);

  const { data: updated } = await service
    .from("wallets")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId)
    .gte("balance", amount)
    .select("balance")
    .maybeSingle();

  if (!updated) return false;

  await service.from("wallet_ledger").insert({
    vendor_id: vendorId,
    amount: -amount,
    entry_type: entryType,
    reference,
    note,
    balance_after: next,
  });

  return true;
}
