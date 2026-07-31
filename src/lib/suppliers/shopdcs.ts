import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierNetworkSlug, SupplierOrderScope } from "./types";

/**
 * ShopDCSGH reseller API — Telecel fulfilment for DCS Elite.
 *   base: https://shopdcsgh.com/api/v1
 *   auth: X-API-KEY header
 *   GET  /fetch-networks
 *   GET  /fetch-data-packages
 *   GET  /check-console-balance
 *   POST /buy-data-package
 *   POST /fetch-single-transaction
 */

const DEFAULT_BASE = "https://shopdcsgh.com/api/v1";

export type ShopDcsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

export interface ShopDcsNetwork {
  id: number;
  name: string;
  description?: string;
}

export interface ShopDcsPackage {
  id: number;
  name?: string | null;
  network_id: number;
  volume: number;
  volumeGB?: string;
  console_price?: string | number;
  status?: string;
  network?: string;
}

export interface ShopDcsBuyResponse {
  success?: boolean;
  message?: string;
  transaction_code?: string;
  transaction_id?: string | number;
  id?: string | number;
  status?: string;
  error?: string;
}

export interface ShopDcsTransaction {
  id?: number | string;
  type?: string;
  status?: string;
  transaction_code?: string;
  created_at?: string;
  order_items?: unknown[];
  message?: string;
  error?: string;
}

export function getShopDcsBaseUrl(): string {
  return (process.env.SHOP_DCS_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/$/, "");
}

export function isShopDcsConfigured(): boolean {
  return Boolean(process.env.SHOP_DCS_API_KEY?.trim());
}

/** Telecel default from live /fetch-networks (id=2). */
export function getShopDcsNetworkId(network: SupplierNetworkSlug): number | null {
  const fromEnv: Record<SupplierNetworkSlug, string | undefined> = {
    mtn: process.env.SHOP_DCS_NETWORK_ID_MTN,
    telecel: process.env.SHOP_DCS_NETWORK_ID_TELECEL,
    at: process.env.SHOP_DCS_NETWORK_ID_AT,
  };
  const defaults: Partial<Record<SupplierNetworkSlug, number>> = {
    telecel: 2,
  };
  const raw = fromEnv[network]?.trim();
  if (raw && /^\d+$/.test(raw)) return Number(raw);
  return defaults[network] ?? null;
}

/** Shop DCS expects a 10-digit local MSISDN (0XXXXXXXXX). */
export function toShopDcsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

/**
 * Shop DCS package `volume` is in GB; buy docs say `shared_bundle` is MB.
 * Live catalogue uses whole-GB sizes (10, 15, 20…). Prefer MB (= GB×1024)
 * when a catalogue match exists; fall back to our data_mb.
 *
 * Override with SHOP_DCS_SHARED_BUNDLE_UNIT=gb to send GB integers instead.
 */
export function sharedBundleFromMb(dataMb: number, matchedPackageVolumeGb?: number): number {
  const unit = (process.env.SHOP_DCS_SHARED_BUNDLE_UNIT ?? "mb").trim().toLowerCase();
  if (unit === "gb") {
    if (matchedPackageVolumeGb != null && matchedPackageVolumeGb > 0) {
      return matchedPackageVolumeGb;
    }
    const gb1000 = dataMb / 1000;
    const gb1024 = dataMb / 1024;
    const pick = Math.abs(gb1000 - Math.round(gb1000)) <= Math.abs(gb1024 - Math.round(gb1024))
      ? gb1000
      : gb1024;
    return Math.max(1, Math.round(pick));
  }
  if (matchedPackageVolumeGb != null && matchedPackageVolumeGb > 0) {
    return Math.round(matchedPackageVolumeGb * 1024);
  }
  return Math.max(1, Math.round(dataMb));
}

export function matchPackageVolumeGb(
  dataMb: number,
  packages: ShopDcsPackage[],
): number | undefined {
  if (!packages.length) return undefined;
  const candidates = [
    dataMb / 1024,
    dataMb / 1000,
    Math.round(dataMb / 1024),
    Math.round(dataMb / 1000),
  ];
  for (const c of candidates) {
    const hit = packages.find((p) => Number(p.volume) === c || Math.abs(Number(p.volume) - c) < 0.05);
    if (hit) return Number(hit.volume);
  }
  // nearest package by GB
  const target = dataMb / 1024;
  let best: ShopDcsPackage | undefined;
  let bestDiff = Infinity;
  for (const p of packages) {
    const diff = Math.abs(Number(p.volume) - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best && bestDiff <= 1 ? Number(best.volume) : undefined;
}

interface LogInput {
  eventType: "submit_single" | "submit_bulk" | "status_poll" | "ping";
  scope?: SupplierOrderScope | null;
  reference?: string | null;
  supplierReference?: string | null;
  httpStatus?: number | null;
  ok?: boolean | null;
  error?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
}

async function logSupplierEvent(input: LogInput): Promise<void> {
  if (!hasSupabaseConfig()) return;
  try {
    const service = createServiceClient();
    await service.from("supplier_logs").insert({
      supplier: "shopdcs",
      event_type: input.eventType,
      scope: input.scope ?? null,
      reference: input.reference ?? null,
      supplier_reference: input.supplierReference ?? null,
      http_status: input.httpStatus ?? null,
      ok: input.ok ?? null,
      error: input.error ?? null,
      request_payload: input.requestPayload ?? null,
      response_payload: input.responsePayload ?? null,
    });
  } catch (err) {
    console.error("[supplier_logs] shopdcs insert failed", err);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown } = {},
): Promise<ShopDcsResult<T>> {
  const apiKey = process.env.SHOP_DCS_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: "SHOP_DCS_API_KEY not set" };
  }

  const headers: Record<string, string> = {
    "X-API-KEY": apiKey,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${getShopDcsBaseUrl()}${path}`, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const errMsg =
        (parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : parsed && typeof parsed === "object" && parsed !== null && "message" in parsed
            ? String((parsed as { message: unknown }).message)
            : undefined) ?? `HTTP ${res.status}`;
      return { ok: false, status: res.status, error: errMsg, data: parsed };
    }
    return { ok: true, status: res.status, data: parsed as T };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function fetchNetworks(): Promise<ShopDcsResult<ShopDcsNetwork[]>> {
  return call<ShopDcsNetwork[]>("GET", "/fetch-networks");
}

export async function fetchDataPackages(): Promise<ShopDcsResult<ShopDcsPackage[]>> {
  return call<ShopDcsPackage[]>("GET", "/fetch-data-packages");
}

export async function checkBalance(): Promise<
  ShopDcsResult<{ status?: string; message?: string; "Wallet Balance"?: string | number }>
> {
  return call("GET", "/check-console-balance");
}

export async function pingSupplier(): Promise<
  ShopDcsResult<{ balance?: string | number; networks?: ShopDcsNetwork[] }>
> {
  const [balance, networks] = await Promise.all([checkBalance(), fetchNetworks()]);
  if (!balance.ok) {
    await logSupplierEvent({
      eventType: "ping",
      ok: false,
      httpStatus: balance.status,
      error: balance.error,
      responsePayload: balance.data,
    });
    return { ok: false, status: balance.status, error: balance.error, data: balance.data as never };
  }
  await logSupplierEvent({
    eventType: "ping",
    ok: true,
    httpStatus: balance.status,
    responsePayload: { balance: balance.data, networks: networks.ok ? networks.data : null },
  });
  return {
    ok: true,
    status: balance.status,
    data: {
      balance: balance.data["Wallet Balance"],
      networks: networks.ok ? networks.data : undefined,
    },
  };
}

export interface SubmitSingleParams {
  network: SupplierNetworkSlug;
  msisdn: string;
  volumeMb: number;
  reference: string;
  scope: SupplierOrderScope;
}

export async function submitSingleOrder(
  params: SubmitSingleParams,
): Promise<ShopDcsResult<ShopDcsBuyResponse>> {
  const networkId = getShopDcsNetworkId(params.network);
  if (networkId == null) {
    return {
      ok: false,
      status: 0,
      error: `Shop DCS network id not configured for ${params.network}`,
    };
  }

  const phone = toShopDcsPhone(params.msisdn);
  if (!phone) {
    return { ok: false, status: 0, error: `Invalid phone: ${params.msisdn}` };
  }

  let matchedGb: number | undefined;
  const pkgs = await fetchDataPackages();
  if (pkgs.ok) {
    const forNet = pkgs.data.filter((p) => Number(p.network_id) === networkId);
    matchedGb = matchPackageVolumeGb(params.volumeMb, forNet);
  }

  const sharedBundle = sharedBundleFromMb(params.volumeMb, matchedGb);
  const body = {
    recipient_msisdn: phone,
    network_id: networkId,
    shared_bundle: sharedBundle,
    incoming_api_ref: params.reference,
  };

  const result = await call<ShopDcsBuyResponse>("POST", "/buy-data-package", { body });

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference:
      (result.ok
        ? String(result.data.transaction_code ?? result.data.transaction_id ?? result.data.id ?? "")
        : null) || null,
    httpStatus: result.status,
    ok: result.ok && result.data.success !== false,
    error: result.ok
      ? result.data.success === false
        ? result.data.message ?? result.data.error ?? "Purchase failed"
        : null
      : result.error,
    requestPayload: body,
    responsePayload: result.ok ? result.data : result.data,
  });

  if (result.ok && result.data.success === false) {
    return {
      ok: false,
      status: result.status,
      error: result.data.message ?? result.data.error ?? "Purchase failed",
      data: result.data,
    };
  }

  return result;
}

export async function submitBulkOrders(params: {
  network: SupplierNetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: SupplierOrderScope;
}): Promise<
  ShopDcsResult<{
    reference: string;
    orders: Array<{ order_code?: string; msisdn?: string; status?: string }>;
  }>
> {
  const orders: Array<{ order_code?: string; msisdn?: string; status?: string }> = [];
  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]!;
    const lineRef = `${params.reference}-${i + 1}`;
    const result = await submitSingleOrder({
      network: params.network,
      msisdn: r.msisdn,
      volumeMb: r.volumeMb,
      reference: lineRef,
      scope: params.scope,
    });
    if (!result.ok) {
      await logSupplierEvent({
        eventType: "submit_bulk",
        scope: params.scope,
        reference: params.reference,
        ok: false,
        error: result.error,
        requestPayload: { failed_at: i, recipient: r },
        responsePayload: result.data,
      });
      return {
        ok: false,
        status: result.status,
        error: result.error,
        data: { reference: params.reference, orders },
      };
    }
    orders.push({
      order_code: String(
        result.data.transaction_code ?? result.data.transaction_id ?? result.data.id ?? lineRef,
      ),
      msisdn: r.msisdn,
      status: result.data.status ?? "pending",
    });
  }

  await logSupplierEvent({
    eventType: "submit_bulk",
    scope: params.scope,
    reference: params.reference,
    ok: true,
    requestPayload: { count: params.recipients.length },
    responsePayload: { orders },
  });

  return {
    ok: true,
    status: 200,
    data: { reference: params.reference, orders },
  };
}

export async function fetchTransactionStatus(
  transactionId: string,
): Promise<ShopDcsResult<ShopDcsTransaction>> {
  const result = await call<ShopDcsTransaction>("POST", "/fetch-single-transaction", {
    body: { transaction_id: transactionId },
  });
  await logSupplierEvent({
    eventType: "status_poll",
    supplierReference: transactionId,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    requestPayload: { transaction_id: transactionId },
    responsePayload: result.ok ? result.data : result.data,
  });
  return result;
}

/** Map Shop DCS transaction status → our delivery outcome. */
export function mapShopDcsStatus(
  status: string | null | undefined,
): "fulfilled" | "failed" | "processing" {
  const s = (status ?? "").trim().toLowerCase();
  if (!s) return "processing";
  if (
    s === "completed" ||
    s === "complete" ||
    s === "success" ||
    s === "successful" ||
    s === "delivered" ||
    s === "fulfilled" ||
    s.includes("success") ||
    s.includes("complete")
  ) {
    return "fulfilled";
  }
  if (
    s === "failed" ||
    s === "fail" ||
    s === "rejected" ||
    s === "cancelled" ||
    s === "canceled" ||
    s.includes("fail") ||
    s.includes("reject")
  ) {
    return "failed";
  }
  return "processing";
}

export function extractTransactionId(data: ShopDcsBuyResponse): string | null {
  const raw = data.transaction_code ?? data.transaction_id ?? data.id;
  if (raw == null) return null;
  return String(raw);
}
