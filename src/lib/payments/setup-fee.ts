import "server-only";
import { getVendorSetupFee } from "@/lib/data/platform-config";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Read the current vendor setup fee from `platform_settings` (admin-controlled).
 * Falls back to env / hard default if the row is missing.
 */
export async function getVendorStoreSetupFeeGhs(): Promise<number> {
  return getVendorSetupFee();
}

export function generateSetupFeeReference() {
  return `DCS-SETUP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

type SetupPaymentRow = {
  id: string;
  user_id: string;
  slug: string;
  status: string;
  reference: string;
  amount: number;
  paid_at: string | null;
};

export async function markSetupPaymentPaid(reference: string, paymentReference?: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("vendor_setup_payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_reference: paymentReference ?? reference,
    })
    .eq("reference", reference)
    .eq("status", "pending")
    .select("id, user_id, slug, status, reference, amount, paid_at")
    .maybeSingle();

  if (error) {
    console.error("[setup-fee mark paid]", error);
    return null;
  }
  return data as SetupPaymentRow | null;
}

export async function verifySetupPaymentWithPaystack(reference: string) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;

  const { fetchWithTimeout } = await import("@/lib/http/fetch-with-timeout");
  const res = await fetchWithTimeout(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret}` } },
    15_000,
  );
  const payload = (await res.json()) as {
    status?: boolean;
    data?: { status?: string; reference?: string; amount?: number };
  };

  if (!payload.status || payload.data?.status !== "success") {
    return false;
  }

  const service = createServiceClient();
  const { data: setup } = await service
    .from("vendor_setup_payments")
    .select("amount, status")
    .eq("reference", reference)
    .maybeSingle();
  const row = setup as { amount: number | string; status: string } | null;
  if (!row || row.status !== "pending") return false;
  const expectedPesewas = Math.round(Number(row.amount) * 100);
  const charged = Number(payload.data?.amount ?? NaN);
  if (!Number.isFinite(expectedPesewas) || Math.abs(charged - expectedPesewas) > 1) {
    console.error(
      "[paystack] setup-fee verify amount mismatch",
      JSON.stringify({ reference, expectedPesewas, charged }),
    );
    return false;
  }

  await markSetupPaymentPaid(reference, payload.data?.reference ?? reference);
  return true;
}

export async function getPaidSetupPaymentForUser(reference: string, userId: string, slug: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("vendor_setup_payments")
    .select("id, user_id, slug, status, reference, amount, paid_at")
    .eq("reference", reference)
    .eq("user_id", userId)
    .eq("slug", slug)
    .eq("status", "paid")
    .maybeSingle();

  return data as SetupPaymentRow | null;
}

export async function linkSetupPaymentToVendor(paymentId: string, vendorId: string, reference: string) {
  const service = createServiceClient();
  const paidAt = new Date().toISOString();

  await service.from("vendor_setup_payments").update({ vendor_id: vendorId }).eq("id", paymentId);

  await service
    .from("vendors")
    .update({
      setup_fee_paid_at: paidAt,
      setup_fee_reference: reference,
    })
    .eq("id", vendorId);
}

import type { SetupPaymentResume } from "@/lib/vendor/onboarding-types";

export type { SetupPaymentResume };

/** Latest setup payment for a user that is paid but not yet linked to a store. */
export async function getPaidSetupAwaitingStore(userId: string): Promise<SetupPaymentResume | null> {
  const service = createServiceClient();
  const { data } = await service
    .from("vendor_setup_payments")
    .select("reference, slug, business_name, amount, paid_at")
    .eq("user_id", userId)
    .eq("status", "paid")
    .is("vendor_id", null)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    reference: string;
    slug: string;
    business_name: string | null;
    amount: number;
    paid_at: string | null;
  };
  return {
    reference: row.reference,
    slug: row.slug,
    businessName: row.business_name,
    amount: Number(row.amount),
    paidAt: row.paid_at,
  };
}

/**
 * Reconcile pending setup-fee rows against Paystack. Handles the common case
 * where a customer paid but never returned to the callback URL (or the webhook
 * was delayed). Safe to call on login / create-store page load.
 */
export async function reconcileUserSetupPayments(userId: string): Promise<number> {
  const service = createServiceClient();
  const { data: pending } = await service
    .from("vendor_setup_payments")
    .select("reference")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(5);

  const rows = (pending ?? []) as { reference: string }[];
  let reconciled = 0;
  for (const row of rows) {
    const ok = await verifySetupPaymentWithPaystack(row.reference);
    if (ok) reconciled += 1;
  }
  return reconciled;
}
