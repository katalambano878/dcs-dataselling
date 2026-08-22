import "server-only";

import crypto from "crypto";

import { AT_MSISDN_PREFIXES, normalizeGhanaMsisdn } from "@/lib/phone/ghana";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { gbFromDataMb } from "./volume";
import type { SupplierNetworkSlug, SupplierOrderScope } from "./types";

/**
 * Adaaya / DCS External Client API — AT (AirtelTigo) fulfilment replacement for MultiData iShare.
 *
 *   base: https://api.adaayalagroup.com/api/v1
 *   auth: X-Api-Key + HMAC-SHA256 (X-Api-Timestamp, X-Api-Signature)
 *   ops:  bundles | purchase | transactions/{id} | balance
 *
 * Purchase is async — poll until status is `success` or `failed`.
 */

const DEFAULT_BASE = "https://api.adaayalagroup.com/api/v1";
const DEFAULT_NETWORK_SLUG = "airteltigo";

export type AdaayaResult<T> =
  | { ok: true; status: number; data: T; requestId?: string | null }
  | { ok: false; status: number; error: string; data?: unknown; requestId?: string | null };

export interface AdaayaBundle {
  id: string;
  network: string;
  name: string;
  data_mb: number;
  price: number;
}

export interface AdaayaTransaction {
  id: string;
  bundle_id: string;
  recipient_msisdn: string;
  data_mb: number;
  price: number;
  status: string;
  reference: string | null;
  failure_code: string | null;
  failure_description: string | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AdaayaBalance {
  network: string;
  status: string;
  data_balance_mb: number;
  checked_at: string;
}

let bundleCache: { fetchedAt: number; bundles: AdaayaBundle[] } | null = null;
const BUNDLE_CACHE_TTL_MS = 5 * 60 * 1000;

export function isAdaayaConfigured(): boolean {
  return Boolean(
    process.env.ADAAYA_API_KEY?.trim() && process.env.ADAAYA_API_SECRET?.trim(),
  );
}

export function getAdaayaBaseUrl(): string {
  return (process.env.ADAAYA_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/$/, "");
}

export function getAdaayaNetworkSlug(network: SupplierNetworkSlug = "at"): string {
  if (network === "at") {
    return (process.env.ADAAYA_NETWORK_SLUG ?? DEFAULT_NETWORK_SLUG).trim().toLowerCase();
  }
  return network;
}

/** Adaaya requires international Ghana MSISDN: 233XXXXXXXXX. */
export function toAdaayaMsisdn(raw: string): string | null {
  const local = normalizeGhanaMsisdn(raw);
  if (!local) return null;
  return `233${local.slice(1)}`;
}

export function isLikelyAtMsisdnLocal(localPhone: string): boolean {
  return AT_MSISDN_PREFIXES.some((p) => localPhone.startsWith(p));
}

export function signAdaayaRequest(args: {
  method: string;
  path: string;
  timestamp: string | number;
  rawBody: string;
  apiSecret: string;
}): string {
  const payload = [
    args.method.toUpperCase(),
    args.path,
    String(args.timestamp),
    args.rawBody ?? "",
  ].join("\n");
  return crypto.createHmac("sha256", args.apiSecret).update(payload).digest("hex");
}

function extractError(parsed: unknown, fallback: string): string {
  if (!parsed || typeof parsed !== "object") return fallback;
  const obj = parsed as Record<string, unknown>;
  const err = obj.error;
  if (err && typeof err === "object") {
    const e = err as { message?: unknown; code?: unknown };
    const msg = typeof e.message === "string" ? e.message.trim() : "";
    const code = typeof e.code === "string" ? e.code.trim() : "";
    if (msg && code) return `${code}: ${msg}`;
    if (msg) return msg;
    if (code) return code;
  }
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  return fallback;
}

function requestIdFrom(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const meta = (parsed as { meta?: { request_id?: unknown } }).meta;
  return typeof meta?.request_id === "string" ? meta.request_id : null;
}

interface LogInput {
  eventType: "submit_single" | "submit_bulk" | "status_poll" | "ping" | "list_bundles";
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
      supplier: "adaaya",
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
    console.error("[supplier_logs] adaaya insert failed", err);
  }
}

async function callAdaaya<T>(args: {
  method: "GET" | "POST";
  /** Path under base, e.g. `/data-distribution/purchase` */
  path: string;
  query?: Record<string, string>;
  bodyObj?: Record<string, unknown> | null;
  idempotencyKey?: string;
}): Promise<AdaayaResult<T>> {
  const apiKey = process.env.ADAAYA_API_KEY?.trim();
  const apiSecret = process.env.ADAAYA_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    return { ok: false, status: 0, error: "ADAAYA_API_KEY / ADAAYA_API_SECRET not set" };
  }

  const base = getAdaayaBaseUrl();
  const qs = args.query
    ? `?${new URLSearchParams(args.query).toString()}`
    : "";
  const url = `${base}${args.path}${qs}`;
  const signedPath = new URL(url).pathname;
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody =
    args.method === "POST" && args.bodyObj
      ? JSON.stringify(args.bodyObj)
      : "";

  const signature = signAdaayaRequest({
    method: args.method,
    path: signedPath,
    timestamp,
    rawBody,
    apiSecret,
  });

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Timestamp": String(timestamp),
    "X-Api-Signature": signature,
  };
  if (args.method === "POST") {
    headers["Content-Type"] = "application/json";
    if (args.idempotencyKey) headers["Idempotency-Key"] = args.idempotencyKey;
  }

  try {
    const res = await fetch(url, {
      method: args.method,
      headers,
      body: args.method === "POST" ? rawBody : undefined,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    const requestId = requestIdFrom(parsed);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: extractError(parsed, `HTTP ${res.status}`),
        data: parsed,
        requestId,
      };
    }

    return { ok: true, status: res.status, data: parsed as T, requestId };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

export async function fetchAdaayaBundles(
  network: SupplierNetworkSlug = "at",
  force = false,
): Promise<AdaayaResult<AdaayaBundle[]>> {
  if (
    !force &&
    bundleCache &&
    Date.now() - bundleCache.fetchedAt < BUNDLE_CACHE_TTL_MS
  ) {
    return { ok: true, status: 200, data: bundleCache.bundles };
  }

  const slug = getAdaayaNetworkSlug(network);
  const result = await callAdaaya<{ data?: { bundles?: AdaayaBundle[] } }>({
    method: "GET",
    path: "/data-distribution/bundles",
    query: { network: slug },
  });

  if (!result.ok) {
    await logSupplierEvent({
      eventType: "list_bundles",
      ok: false,
      httpStatus: result.status,
      error: result.error,
      responsePayload: result.data,
    });
    return result;
  }

  const bundles = Array.isArray(result.data.data?.bundles)
    ? result.data.data!.bundles!
    : [];
  bundleCache = { fetchedAt: Date.now(), bundles };
  await logSupplierEvent({
    eventType: "list_bundles",
    ok: true,
    httpStatus: result.status,
    responsePayload: { count: bundles.length, network: slug },
  });
  return { ok: true, status: result.status, data: bundles, requestId: result.requestId };
}

export function matchAdaayaBundle(
  bundles: AdaayaBundle[],
  volumeMb: number,
): AdaayaBundle | null {
  if (!bundles.length || !Number.isFinite(volumeMb) || volumeMb <= 0) return null;

  const exact = bundles.find((b) => Number(b.data_mb) === volumeMb);
  if (exact) return exact;

  const targetGb = gbFromDataMb(volumeMb);
  const byGb = bundles
    .map((b) => ({ b, gb: gbFromDataMb(Number(b.data_mb)) }))
    .filter((x) => x.gb === targetGb)
    .sort((a, b) => Number(a.b.price) - Number(b.b.price));
  if (byGb[0]) return byGb[0].b;

  // Closest within 0.5 GB
  const ranked = bundles
    .map((b) => ({ b, gb: gbFromDataMb(Number(b.data_mb)) }))
    .sort((a, b) => Math.abs(a.gb - targetGb) - Math.abs(b.gb - targetGb));
  const near = ranked[0];
  if (near && Math.abs(near.gb - targetGb) <= 0.5) return near.b;
  return null;
}

export async function resolveAdaayaBundleId(
  network: SupplierNetworkSlug,
  volumeMb: number,
): Promise<{ bundleId: string; bundle: AdaayaBundle } | { error: string }> {
  const envKey = `ADAAYA_BUNDLE_ID_${network.toUpperCase()}_${gbFromDataMb(volumeMb)}GB`;
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) {
    return {
      bundleId: fromEnv,
      bundle: {
        id: fromEnv,
        network: getAdaayaNetworkSlug(network),
        name: envKey,
        data_mb: volumeMb,
        price: 0,
      },
    };
  }

  const catalog = await fetchAdaayaBundles(network);
  if (!catalog.ok) return { error: catalog.error };
  const match = matchAdaayaBundle(catalog.data, volumeMb);
  if (!match) {
    return {
      error: `No Adaaya bundle for ${network} ~${gbFromDataMb(volumeMb)}GB (${volumeMb}MB). Assign bundles or set ${envKey}.`,
    };
  }
  return { bundleId: match.id, bundle: match };
}

export async function fetchAdaayaBalance(
  network: SupplierNetworkSlug = "at",
): Promise<AdaayaResult<AdaayaBalance>> {
  const slug = getAdaayaNetworkSlug(network);
  const result = await callAdaaya<{ data?: { balance?: AdaayaBalance } }>({
    method: "GET",
    path: "/data-distribution/balance",
    query: { network: slug },
  });

  if (!result.ok) {
    await logSupplierEvent({
      eventType: "ping",
      ok: false,
      httpStatus: result.status,
      error: result.error,
      responsePayload: result.data,
    });
    return result;
  }

  const balance = result.data.data?.balance;
  if (!balance) {
    const error = "Balance payload missing";
    await logSupplierEvent({
      eventType: "ping",
      ok: false,
      httpStatus: result.status,
      error,
      responsePayload: result.data,
    });
    return { ok: false, status: result.status, error, data: result.data };
  }

  const ok = (balance.status ?? "").toLowerCase() === "available";
  await logSupplierEvent({
    eventType: "ping",
    ok,
    httpStatus: result.status,
    error: ok ? null : `Balance status: ${balance.status}`,
    responsePayload: result.data,
  });

  return { ok: true, status: result.status, data: balance, requestId: result.requestId };
}

export async function fetchAdaayaTransaction(
  transactionId: string,
): Promise<AdaayaResult<AdaayaTransaction>> {
  const result = await callAdaaya<{ data?: { transaction?: AdaayaTransaction } }>({
    method: "GET",
    path: `/data-distribution/transactions/${encodeURIComponent(transactionId)}`,
  });

  if (!result.ok) {
    await logSupplierEvent({
      eventType: "status_poll",
      supplierReference: transactionId,
      ok: false,
      httpStatus: result.status,
      error: result.error,
      responsePayload: result.data,
    });
    return result;
  }

  const txn = result.data.data?.transaction;
  if (!txn) {
    const error = "Transaction payload missing";
    await logSupplierEvent({
      eventType: "status_poll",
      supplierReference: transactionId,
      ok: false,
      httpStatus: result.status,
      error,
      responsePayload: result.data,
    });
    return { ok: false, status: result.status, error, data: result.data };
  }

  await logSupplierEvent({
    eventType: "status_poll",
    supplierReference: transactionId,
    ok: true,
    httpStatus: result.status,
    responsePayload: result.data,
  });

  return { ok: true, status: result.status, data: txn, requestId: result.requestId };
}

export function mapAdaayaStatus(
  status: string | null | undefined,
): "fulfilled" | "failed" | "processing" {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "success") return "fulfilled";
  if (s === "failed") return "failed";
  return "processing";
}

export function isAdaayaTransactionId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
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
): Promise<
  AdaayaResult<{
    reference: string;
    orderId: string;
    status: string;
    transaction: AdaayaTransaction;
  }>
> {
  if (params.network !== "at") {
    const error = "Adaaya supplier currently supports AirtelTigo (AT) only";
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const local = normalizeGhanaMsisdn(params.msisdn);
  const phone = toAdaayaMsisdn(params.msisdn);
  if (!local || !phone) {
    const error = `Invalid phone: ${params.msisdn}`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  if (!isLikelyAtMsisdnLocal(local)) {
    const error = `Adaaya AT only accepts AirtelTigo numbers (026/027/056/057/023). ${local} looks like another network.`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const resolved = await resolveAdaayaBundleId(params.network, params.volumeMb);
  if ("error" in resolved) {
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error: resolved.error,
    });
    return { ok: false, status: 0, error: resolved.error };
  }

  const body = {
    bundle_id: resolved.bundleId,
    recipient_msisdn: phone,
  };

  const purchase = await callAdaaya<{ data?: { transaction?: AdaayaTransaction } }>({
    method: "POST",
    path: "/data-distribution/purchase",
    bodyObj: body,
    idempotencyKey: params.reference.slice(0, 120),
  });

  const txn = purchase.ok ? purchase.data.data?.transaction : undefined;
  const accepted = Boolean(purchase.ok && txn?.id);

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: txn?.id ?? null,
    httpStatus: purchase.status,
    ok: accepted,
    error: accepted
      ? null
      : purchase.ok
        ? "Purchase response missing transaction"
        : purchase.error,
    requestPayload: body,
    responsePayload: purchase.ok ? purchase.data : purchase.data,
  });

  if (!purchase.ok) return purchase;
  if (!txn?.id) {
    return {
      ok: false,
      status: purchase.status,
      error: "Purchase response missing transaction",
      data: purchase.data,
    };
  }

  return {
    ok: true,
    status: purchase.status,
    data: {
      reference: txn.id,
      orderId: txn.id,
      status: txn.status ?? "pending",
      transaction: txn,
    },
    requestId: purchase.requestId,
  };
}

export interface SubmitBulkParams {
  network: SupplierNetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: SupplierOrderScope;
}

export async function submitBulkOrders(
  params: SubmitBulkParams,
): Promise<
  AdaayaResult<{
    reference: string;
    orders: Array<{ order_code?: string; msisdn?: string; status?: string }>;
  }>
> {
  const orders: Array<{ order_code?: string; msisdn?: string; status?: string }> = [];
  let anyAccepted = false;
  let firstError: string | undefined;

  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]!;
    const lineRef = `${params.reference}-${i + 1}`;
    const single = await submitSingleOrder({
      network: params.network,
      msisdn: r.msisdn,
      volumeMb: r.volumeMb,
      reference: lineRef,
      scope: params.scope,
    });
    if (!single.ok) {
      firstError ??= single.error;
      orders.push({ msisdn: r.msisdn, status: "failed" });
      continue;
    }
    anyAccepted = true;
    orders.push({
      order_code: single.data.orderId,
      msisdn: r.msisdn,
      status: single.data.status,
    });
  }

  if (!anyAccepted) {
    return { ok: false, status: 0, error: firstError ?? "All lines rejected" };
  }

  return {
    ok: true,
    status: 200,
    data: { reference: params.reference, orders },
  };
}

export async function pingSupplier(): Promise<AdaayaResult<AdaayaBalance>> {
  return fetchAdaayaBalance("at");
}
