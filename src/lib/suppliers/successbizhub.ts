import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierNetworkSlug, SupplierOrderScope } from "./types";

/**
 * DataCoreGH wholesale data supplier (kept under the legacy "successbizhub"
 * id/env prefix so existing routing + logs keep working).
 *   host: https://datacoregh.com/api/v1
 *   auth: x-api-key header
 *   order: POST /order/{network}  body { type, volume, phone, offerSlug }
 *   networks (URL path): mtn | telecel | at      offerSlugs: mtn | telecel | ishare
 */

const BASE_URL =
  process.env.SUCCESSBIZHUB_BASE_URL ?? "https://datacoregh.com/api/v1";

export type SuccessBizHubResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

export interface SuccessBizHubOrderResponse {
  success: boolean;
  orderId?: string;
  reference?: string;
  status?: string;
  totalAmount?: number;
  currency?: string;
  items?: Array<{ recipient?: string; volume?: number; status?: string }>;
  message?: string;
  error?: string;
  type?: string;
}

export interface SuccessBizHubBalanceResponse {
  success: boolean;
  balance?: number;
  currency?: string;
  name?: string;
  error?: string;
}

export interface SuccessBizHubOffersResponse {
  success: boolean;
  offers?: Array<{
    name: string;
    isp: string;
    type: string;
    offerSlug: string;
    volumes: number[];
  }>;
  error?: string;
}

export function isSuccessBizHubConfigured(): boolean {
  return Boolean(process.env.SUCCESSBIZHUB_API_KEY?.trim());
}

export function getSuccessBizHubWebhookUrl(): string | null {
  const explicit = process.env.SUCCESSBIZHUB_WEBHOOK_URL?.trim();
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!site) return null;
  return `${site.replace(/\/$/, "")}/api/webhooks/successbizhub`;
}

/** Map internal network slug to Success Biz Hub path segment. */
export function successBizHubNetworkPath(network: SupplierNetworkSlug): string {
  if (network === "at") {
    return (process.env.SUCCESSBIZHUB_NETWORK_AT ?? "at").trim().toLowerCase();
  }
  return network;
}

export function getSuccessBizHubOfferSlug(network: SupplierNetworkSlug): string | null {
  // Defaults verified live from GET /offers on datacoregh.com.
  const defaults: Record<SupplierNetworkSlug, string> = {
    mtn: "mtn",
    telecel: "telecel",
    at: "ishare",
  };
  const fromEnv: Record<SupplierNetworkSlug, string | undefined> = {
    mtn: process.env.SUCCESSBIZHUB_OFFER_SLUG_MTN,
    telecel: process.env.SUCCESSBIZHUB_OFFER_SLUG_TELECEL,
    at: process.env.SUCCESSBIZHUB_OFFER_SLUG_AT,
  };
  const slug = fromEnv[network]?.trim() || defaults[network];
  return slug || null;
}

/** Success Biz Hub expects volume in GB (string), not MB. 1 GB = 1000 MB. */
export function volumeGbFromMb(dataMb: number): string {
  const gb = dataMb / 1000;
  if (gb <= 0.75) return "1";
  const rounded = Math.round(gb * 2) / 2;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

/** Normalize to 233XXXXXXXXX as shown in the Postman collection. */
export function toSuccessBizPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("233")) return digits;
  if (digits.length === 10 && digits.startsWith("0")) return `233${digits.slice(1)}`;
  if (digits.length === 9) return `233${digits}`;
  return null;
}

interface LogInput {
  eventType: "submit_single" | "submit_bulk" | "status_poll" | "webhook" | "ping";
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
      supplier: "successbizhub",
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
    console.error("[supplier_logs] successbizhub insert failed", err);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown } = {},
): Promise<SuccessBizHubResult<T>> {
  const apiKey = process.env.SUCCESSBIZHUB_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: "SUCCESSBIZHUB_API_KEY not set" };
  }

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
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
        (parsed && typeof parsed === "object" && "error" in parsed
          ? String((parsed as { error: unknown }).error)
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

export interface SubmitSingleParams {
  network: SupplierNetworkSlug;
  msisdn: string;
  volumeMb: number;
  reference: string;
  scope: SupplierOrderScope;
}

export async function submitSingleOrder(
  params: SubmitSingleParams,
): Promise<SuccessBizHubResult<SuccessBizHubOrderResponse>> {
  const offerSlug = getSuccessBizHubOfferSlug(params.network);
  const phone = toSuccessBizPhone(params.msisdn);
  const network = successBizHubNetworkPath(params.network);

  if (!offerSlug) {
    const error = `SUCCESSBIZHUB_OFFER_SLUG_${params.network.toUpperCase()} not configured`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }
  if (!phone) {
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

  const body: Record<string, unknown> = {
    type: "single",
    // DataCoreGH expects the GB value as a number (see GET /offers volumes).
    volume: params.scope === "console_send"
      ? +(params.volumeMb / 1000).toFixed(2)
      : Number(volumeGbFromMb(params.volumeMb)),
    phone,
    offerSlug,
    metadata: { idempotencyKey: params.reference },
  };
  const webhookUrl = getSuccessBizHubWebhookUrl();
  if (webhookUrl) body.webhookUrl = webhookUrl;

  const result = await call<SuccessBizHubOrderResponse>("POST", `/order/${network}`, { body });

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: result.ok ? (result.data.reference ?? null) : null,
    httpStatus: result.status,
    ok: result.ok && result.data.success !== false,
    error: result.ok
      ? result.data.success === false
        ? (result.data.error ?? "Supplier rejected order")
        : null
      : result.error,
    requestPayload: body,
    responsePayload: result.ok ? result.data : (result.data ?? result.error),
  });

  if (!result.ok) return result;
  if (result.data.success === false) {
    return {
      ok: false,
      status: result.status,
      error: result.data.error ?? "Order rejected",
      data: result.data,
    };
  }
  return result;
}

export interface SubmitBulkParams {
  network: SupplierNetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: SupplierOrderScope;
}

/** Submit each line as a single order (API supports bulk but schema is not published). */
export async function submitBulkOrders(
  params: SubmitBulkParams,
): Promise<
  SuccessBizHubResult<{
    reference: string;
    orders: Array<{ order_code?: string; msisdn?: string; status?: string }>;
  }>
> {
  const rows: Array<{ order_code?: string; msisdn?: string; status?: string }> = [];
  const refs: string[] = [];
  let firstError: string | null = null;

  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]!;
    const subRef = `${params.reference}-${i + 1}`;
    const single = await submitSingleOrder({
      network: params.network,
      msisdn: r.msisdn,
      volumeMb: r.volumeMb,
      reference: subRef,
      scope: params.scope,
    });
    if (!single.ok || single.data.success === false) {
      firstError ??= single.ok ? (single.data.error ?? "Rejected") : single.error;
      rows.push({ msisdn: r.msisdn, status: "failed" });
      continue;
    }
    if (single.data.reference) refs.push(single.data.reference);
    rows.push({
      order_code: single.data.orderId,
      msisdn: r.msisdn,
      status: single.data.status ?? "pending",
    });
  }

  const accepted = rows.filter((r) => r.status !== "failed").length;
  if (accepted === 0) {
    return { ok: false, status: 0, error: firstError ?? "All lines rejected" };
  }

  return {
    ok: true,
    status: 201,
    data: {
      reference: refs.join(",") || params.reference,
      orders: rows,
    },
  };
}

export async function pingSupplier(): Promise<SuccessBizHubResult<SuccessBizHubBalanceResponse>> {
  const result = await call<SuccessBizHubBalanceResponse>("GET", "/balance");
  await logSupplierEvent({
    eventType: "ping",
    httpStatus: result.status,
    ok: result.ok && result.data.success !== false,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.data,
  });
  return result;
}

export async function fetchOffers(): Promise<SuccessBizHubResult<SuccessBizHubOffersResponse>> {
  return call<SuccessBizHubOffersResponse>("GET", "/offers");
}

export async function pollOrderStatus(
  identifier: string,
): Promise<SuccessBizHubResult<{ success: boolean; order?: { status?: string } }>> {
  const result = await call<{ success: boolean; order?: { status?: string } }>(
    "GET",
    `/order/status/${encodeURIComponent(identifier)}`,
  );
  await logSupplierEvent({
    eventType: "status_poll",
    supplierReference: identifier,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.data,
  });
  return result;
}

export async function logWebhookEvent(input: {
  ok: boolean;
  error?: string | null;
  supplierReference?: string | null;
  payload?: unknown;
}): Promise<void> {
  await logSupplierEvent({
    eventType: "webhook",
    supplierReference: input.supplierReference ?? null,
    ok: input.ok,
    error: input.error ?? null,
    responsePayload: input.payload ?? null,
  });
}

/** Map Success Biz Hub status strings to internal fulfilment bucket. */
export function mapSuccessBizStatus(status: string): "fulfilled" | "failed" | "processing" {
  const s = status.toLowerCase();
  if (["delivered", "completed", "success", "fulfilled"].includes(s)) return "fulfilled";
  if (["failed", "undelivered", "cancelled", "canceled", "rejected"].includes(s)) return "failed";
  return "processing";
}
