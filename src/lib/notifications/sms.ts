import "server-only";
import { SITE } from "@/lib/constants";
import { sendArkeselSms, type SmsLogContext, type SmsResult } from "@/lib/notifications/arkesel";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

async function smsAlreadySent(template: string, reference: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return true;
  const service = createServiceClient();
  const { data } = await service
    .from("sms_logs")
    .select("id")
    .eq("template", template)
    .eq("status", "sent")
    .eq("context->>reference", reference)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function smsOrderPaymentReceived(params: {
  phone: string;
  reference: string;
  bundleLabel: string;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: Payment received (${params.reference}). Your ${params.bundleLabel} bundle is being processed.`;
  const ctx: SmsLogContext = {
    template: "order_payment_received",
    context: { reference: params.reference, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsOrderFulfilled(params: {
  phone: string;
  reference: string;
  bundleLabel: string;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: ${params.bundleLabel} delivered to your line. Ref ${params.reference}. Thank you!`;
  const ctx: SmsLogContext = {
    template: "order_fulfilled",
    context: { reference: params.reference, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWholesaleDelivered(params: {
  phone: string;
  bundleLabel: string;
  reference: string;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: Your ${params.bundleLabel} bundle has been delivered. Enjoy! Ref ${params.reference}.`;
  const ctx: SmsLogContext = {
    template: "wholesale_delivered",
    context: { reference: params.reference, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWholesaleVendorFulfilled(params: {
  phone: string;
  reference: string;
  itemCount: number;
  totalAmount: number;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const lines = `${params.itemCount} line${params.itemCount === 1 ? "" : "s"}`;
  const message = `${SITE.name}: Order ${params.reference} delivered — ${lines}, GHS ${params.totalAmount.toFixed(2)}. Recipients have been topped up.`;
  const ctx: SmsLogContext = {
    template: "wholesale_vendor_fulfilled",
    context: { reference: params.reference, itemCount: params.itemCount, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWalletTopup(params: {
  phone: string;
  amount: number;
  reference: string;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  if (await smsAlreadySent("wallet_topup", params.reference)) {
    return { ok: false, skipped: true, reason: "already_sent" };
  }
  const message = `${SITE.name}: Wallet topped up GHS ${params.amount.toFixed(2)}. Ref ${params.reference}.`;
  const ctx: SmsLogContext = {
    template: "wallet_topup",
    context: { reference: params.reference, amount: params.amount, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWalletAdminCredit(params: {
  phone: string;
  amount: number;
  reference: string;
  balanceAfter: number;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: GHS ${params.amount.toFixed(2)} credited to your wallet by admin. Balance GHS ${params.balanceAfter.toFixed(2)}. Ref ${params.reference}.`;
  const ctx: SmsLogContext = {
    template: "wallet_admin_credit",
    context: { reference: params.reference, amount: params.amount, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWalletOrderRefund(params: {
  phone: string;
  amount: number;
  reference: string;
  balanceAfter?: number;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const dedupeRef = `REFUND-${params.reference}-${params.amount}`;
  if (await smsAlreadySent("wallet_order_refund", dedupeRef)) {
    return { ok: false, skipped: true, reason: "already_sent" };
  }
  const balancePart =
    params.balanceAfter != null ? ` Balance GHS ${params.balanceAfter.toFixed(2)}.` : "";
  const message = `${SITE.name}: Order ${params.reference} — GHS ${params.amount.toFixed(2)} refunded to your wallet.${balancePart} Check your transaction history.`;
  const ctx: SmsLogContext = {
    template: "wallet_order_refund",
    context: { reference: dedupeRef, orderReference: params.reference, amount: params.amount, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsWalletAdminDebit(params: {
  phone: string;
  amount: number;
  reference: string;
  balanceAfter: number;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: GHS ${params.amount.toFixed(2)} debited from your wallet by admin. Balance GHS ${params.balanceAfter.toFixed(2)}. Ref ${params.reference}.`;
  const ctx: SmsLogContext = {
    template: "wallet_admin_debit",
    context: { reference: params.reference, amount: params.amount, ...params.context },
  };
  return sendArkeselSms([params.phone], message, ctx);
}

export async function smsPasswordReset(params: {
  phone: string;
  tempPassword: string;
  context?: Record<string, unknown>;
}): Promise<SmsResult> {
  const message = `${SITE.name}: Your password was reset by admin. New password: ${params.tempPassword}. Sign in and change it in Profile.`;
  const ctx: SmsLogContext = {
    template: "admin_password_reset",
    context: params.context,
  };
  return sendArkeselSms([params.phone], message, ctx);
}
