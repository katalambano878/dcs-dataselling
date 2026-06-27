import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { getResolvedSupplierForNetwork } from "@/lib/suppliers/routing";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";
import {
  creditConsoleBalance,
  debitConsoleBalance,
  getOrCreateConsoleAccount,
} from "@/lib/console/account";
import { generateConsoleReference } from "@/lib/console/units";

export interface ConsoleSendRow {
  id: string;
  vendorId: string;
  recipientPhone: string;
  network: SupplierNetworkSlug;
  amountMb: number;
  balanceAfterMb: number | null;
  reference: string;
  batchId: string | null;
  status: string;
  supplier: string | null;
  supplierReference: string | null;
  supplierStatus: string | null;
  supplierError: string | null;
  createdAt: string;
  completedAt: string | null;
}

export type ConsoleSendResult =
  | { ok: true; send: ConsoleSendRow }
  | { ok: false; error: string; code?: string };

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const local = digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
  return /^0\d{9}$/.test(local) ? local : null;
}

export async function sendConsoleBundle(params: {
  vendorId: string;
  recipientPhone: string;
  network: SupplierNetworkSlug;
  amountMb: number;
  reference?: string;
  batchId?: string;
}): Promise<ConsoleSendResult> {
  if (!hasSupabaseConfig()) return { ok: false, error: "Not configured" };

  const phone = normalizePhone(params.recipientPhone);
  if (!phone) return { ok: false, error: "Invalid Ghana phone number", code: "invalid_phone" };
  if (params.amountMb <= 0) return { ok: false, error: "Invalid bundle size", code: "invalid_amount" };

  const account = await getOrCreateConsoleAccount(params.vendorId);
  if (!account?.enabled) {
    return { ok: false, error: "Data console is not enabled for your account", code: "console_disabled" };
  }

  const service = createServiceClient();
  const reference = params.reference ?? generateConsoleReference();

  const { data: existing } = await service
    .from("console_send_ledger")
    .select("id, reference, status, recipient_phone, network, amount_mb, balance_after_mb, supplier, supplier_reference, supplier_status, supplier_error, batch_id, created_at, completed_at")
    .eq("reference", reference)
    .maybeSingle();

  if (existing) {
    const row = existing as Record<string, unknown>;
    return {
      ok: true,
      send: mapSendRow(params.vendorId, row),
    };
  }

  const debit = await debitConsoleBalance(params.vendorId, params.amountMb);
  if (!debit.ok) return { ok: false, error: debit.error, code: "insufficient_balance" };

  const { data: inserted, error: insertErr } = await service
    .from("console_send_ledger")
    .insert({
      vendor_id: params.vendorId,
      recipient_phone: phone,
      network: params.network,
      amount_mb: params.amountMb,
      balance_after_mb: debit.balanceAfterMb,
      reference,
      batch_id: params.batchId ?? null,
      status: "processing",
    })
    .select("id, reference, status, recipient_phone, network, amount_mb, balance_after_mb, supplier, supplier_reference, supplier_status, supplier_error, batch_id, created_at, completed_at")
    .single();

  if (insertErr || !inserted) {
    await creditConsoleBalance(params.vendorId, params.amountMb);
    return { ok: false, error: insertErr?.message ?? "Could not create send record" };
  }

  const sendId = (inserted as { id: string }).id;
  const supplier = await getResolvedSupplierForNetwork(params.network);

  const result = await supplier.submitSingle({
    network: params.network,
    msisdn: phone,
    volumeMb: params.amountMb,
    reference,
    scope: "console_send",
  });

  if (result.manual) {
    await service
      .from("console_send_ledger")
      .update({
        status: "processing",
        supplier: supplier.id,
        supplier_status: "awaiting_manual",
        supplier_error: null,
      })
      .eq("id", sendId);

    return {
      ok: true,
      send: mapSendRow(params.vendorId, {
        ...(inserted as Record<string, unknown>),
        supplier: supplier.id,
        supplier_status: "awaiting_manual",
        status: "processing",
      }),
    };
  }

  if (!result.ok) {
    const restored = await creditConsoleBalance(params.vendorId, params.amountMb);
    await service
      .from("console_send_ledger")
      .update({
        status: "failed",
        supplier: supplier.id,
        supplier_status: "failed",
        supplier_error: (result.error ?? "Supplier rejected order").slice(0, 500),
        balance_after_mb: restored,
        completed_at: new Date().toISOString(),
      })
      .eq("id", sendId);

    return { ok: false, error: result.error ?? "Supplier rejected order", code: "supplier_failed" };
  }

  await service
    .from("console_send_ledger")
    .update({
      status: "completed",
      supplier: supplier.id,
      supplier_reference: result.reference ?? null,
      supplier_status: result.status ?? "accepted",
      completed_at: new Date().toISOString(),
    })
    .eq("id", sendId);

  return {
    ok: true,
    send: mapSendRow(params.vendorId, {
      ...(inserted as Record<string, unknown>),
      status: "completed",
      supplier: supplier.id,
      supplier_reference: result.reference ?? null,
      supplier_status: result.status ?? "accepted",
      completed_at: new Date().toISOString(),
    }),
  };
}

function mapSendRow(vendorId: string, row: Record<string, unknown>): ConsoleSendRow {
  return {
    id: String(row.id),
    vendorId,
    recipientPhone: String(row.recipient_phone),
    network: row.network as SupplierNetworkSlug,
    amountMb: Number(row.amount_mb),
    balanceAfterMb: row.balance_after_mb != null ? Number(row.balance_after_mb) : null,
    reference: String(row.reference),
    batchId: (row.batch_id as string | null) ?? null,
    status: String(row.status),
    supplier: (row.supplier as string | null) ?? null,
    supplierReference: (row.supplier_reference as string | null) ?? null,
    supplierStatus: (row.supplier_status as string | null) ?? null,
    supplierError: (row.supplier_error as string | null) ?? null,
    createdAt: String(row.created_at),
    completedAt: (row.completed_at as string | null) ?? null,
  };
}

export async function fetchConsoleSends(vendorId: string, limit = 50): Promise<ConsoleSendRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("console_send_ledger")
    .select(
      "id, vendor_id, recipient_phone, network, amount_mb, balance_after_mb, reference, batch_id, status, supplier, supplier_reference, supplier_status, supplier_error, created_at, completed_at",
    )
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) =>
    mapSendRow(vendorId, row as Record<string, unknown>),
  );
}

export interface ConsoleCreditRow {
  id: string;
  vendorId: string;
  amountMb: number;
  balanceAfterMb: number;
  reference: string;
  note: string | null;
  createdAt: string;
}

export async function fetchConsoleCredits(vendorId: string, limit = 50): Promise<ConsoleCreditRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("console_credit_ledger")
    .select("id, vendor_id, amount_mb, balance_after_mb, reference, note, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      vendor_id: string;
      amount_mb: number;
      balance_after_mb: number;
      reference: string;
      note: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      vendorId: r.vendor_id,
      amountMb: Number(r.amount_mb),
      balanceAfterMb: Number(r.balance_after_mb),
      reference: r.reference,
      note: r.note,
      createdAt: r.created_at,
    };
  });
}
