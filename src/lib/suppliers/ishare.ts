import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierNetworkSlug, SupplierOrderScope } from "./types";

/**
 * MultiData Ghana iShare merchant API (AT data console fulfilment).
 *
 *   base: https://multidataghana.com/merchintegrate/{merchant}/ishare_api/
 *   auth: apikey in POST form body
 *   ops:  pushData | getBalance | getStatus
 */

const DEFAULT_MERCHANT = "divinelychosenstar";

export type IshareResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

export interface IshareBalanceResponse {
  status?: string;
  balance?: string;
  expiry?: string;
}

export interface IsharePushResponse {
  request_status?: number;
  request_message?: string;
  data?: {
    request_status_code?: string;
    req_message?: string;
  };
  balance?: IshareBalanceResponse;
}

export interface IshareStatusResponse {
  request_status?: number;
  request_message?: string;
  details?: {
    delivery_status?: string;
    status_code?: string | null;
    status_description?: string | null;
  };
}

type IshareOperation = "pushData" | "getBalance" | "getStatus";

export function isIshareConfigured(): boolean {
  return Boolean(process.env.ISHARE_API_KEY?.trim());
}

export function getIshareApiUrl(): string {
  const base = (process.env.ISHARE_BASE_URL ?? "https://multidataghana.com").trim().replace(/\/$/, "");
  const merchant = (process.env.ISHARE_MERCHANT_SLUG ?? DEFAULT_MERCHANT).trim();
  return `${base}/merchintegrate/${merchant}/ishare_api/`;
}

/** Normalize to local 0XXXXXXXXX format expected by the `share` field. */
export function normalizeIshareMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

/**
 * Map console MB (decimal GB: 1000 MB = 1 GB) to the `data` field (GB string).
 * e.g. 50_000 MB → "50", 500 MB → "0.5"
 */
export function volumeDataFromMb(volumeMb: number): string {
  const gb = volumeMb / 1000;
  if (gb <= 0) return "0";
  if (gb % 1 === 0) return String(Math.round(gb));
  const rounded = Math.round(gb * 10) / 10;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(1);
}

function extractError(parsed: unknown, fallback: string): string {
  if (!parsed || typeof parsed !== "object") return fallback;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.request_message === "string" && obj.request_message.trim()) {
    return obj.request_message.trim();
  }
  const nested = obj.data;
  if (nested && typeof nested === "object") {
    const req = (nested as { req_message?: unknown }).req_message;
    if (typeof req === "string" && req.trim()) return req.trim();
  }
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  return fallback;
}

function isRequestAccepted(parsed: IsharePushResponse | IshareStatusResponse): boolean {
  return parsed.request_status === 1;
}

export function isIshareDeliverySuccess(deliveryStatus: string | undefined | null): boolean {
  if (!deliveryStatus) return false;
  const s = deliveryStatus.toLowerCase();
  if (s.includes("fail") || s.includes("error") || s.includes("reject")) return false;
  return (
    s.includes("success") ||
    s.includes("delivered") ||
    s.includes("complete") ||
    (s.includes("deliver") && !s.includes("failed"))
  );
}

export function isIshareDeliveryFailed(deliveryStatus: string | undefined | null): boolean {
  if (!deliveryStatus) return false;
  const s = deliveryStatus.toLowerCase();
  return s.includes("fail") || s.includes("error") || s.includes("reject");
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
      supplier: "ishare",
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
    console.error("[supplier_logs] ishare insert failed", err);
  }
}

async function callIshare<T>(
  fields: Record<string, string>,
  operation: IshareOperation,
): Promise<IshareResult<T>> {
  const apiKey = process.env.ISHARE_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: "ISHARE_API_KEY not set" };
  }

  const body = new URLSearchParams({ ...fields, apikey: apiKey });
  const url = getIshareApiUrl();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body,
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
      return {
        ok: false,
        status: res.status,
        error: extractError(parsed, `HTTP ${res.status}`),
        data: parsed,
      };
    }

    return { ok: true, status: res.status, data: parsed as T };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    return { ok: false, status: 0, error: message };
  }
}

export async function fetchIshareBalance(): Promise<IshareResult<IshareBalanceResponse>> {
  const result = await callIshare<IshareBalanceResponse>({ type: "getBalance" }, "getBalance");
  await logSupplierEvent({
    eventType: "ping",
    httpStatus: result.status,
    ok: result.ok && result.data.status === "200",
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.data,
  });
  return result;
}

export async function fetchIshareStatus(reference: string): Promise<IshareResult<IshareStatusResponse>> {
  const result = await callIshare<IshareStatusResponse>(
    { type: "getStatus", chosenRef: reference },
    "getStatus",
  );
  const accepted = result.ok && isRequestAccepted(result.data);
  await logSupplierEvent({
    eventType: "status_poll",
    reference,
    httpStatus: result.status,
    ok: accepted,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.data,
  });
  return result;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDeliveryStatus(
  reference: string,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<IshareResult<{ deliveryStatus: string; status: IshareStatusResponse }>> {
  const attempts = opts.attempts ?? 4;
  const delayMs = opts.delayMs ?? 2000;
  let last: IshareStatusResponse | null = null;

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delayMs);
    const poll = await fetchIshareStatus(reference);
    if (!poll.ok) return poll;
    last = poll.data;
    if (!isRequestAccepted(poll.data)) {
      return {
        ok: false,
        status: poll.status,
        error: extractError(poll.data, "Status check rejected"),
        data: poll.data,
      };
    }
    const delivery = poll.data.details?.delivery_status ?? "";
    if (isIshareDeliverySuccess(delivery) || isIshareDeliveryFailed(delivery)) {
      return {
        ok: true,
        status: poll.status,
        data: { deliveryStatus: delivery, status: poll.data },
      };
    }
  }

  const delivery = last?.details?.delivery_status ?? "pending";
  return {
    ok: true,
    status: 200,
    data: { deliveryStatus: delivery, status: last ?? {} },
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
): Promise<
  IshareResult<{
    reference: string;
    status: string;
    deliveryStatus: string;
    balance?: IshareBalanceResponse;
  }>
> {
  if (params.network !== "at") {
    const error = "iShare supplier only supports AirtelTigo (AT) network";
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const phone = normalizeIshareMsisdn(params.msisdn);
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

  const dataGb = volumeDataFromMb(params.volumeMb);
  if (Number(dataGb) <= 0) {
    const error = `Invalid bundle size: ${params.volumeMb}MB`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const payload = {
    type: "pushData",
    ref: params.reference,
    data: dataGb,
    share: phone,
  };

  const push = await callIshare<IsharePushResponse>(payload, "pushData");
  const pushAccepted = push.ok && isRequestAccepted(push.data);

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: params.reference,
    httpStatus: push.status,
    ok: pushAccepted,
    error: pushAccepted ? null : push.ok ? extractError(push.data, "pushData rejected") : push.error,
    requestPayload: payload,
    responsePayload: push.ok ? push.data : push.data,
  });

  if (!push.ok) return push;
  if (!pushAccepted) {
    return {
      ok: false,
      status: push.status,
      error: extractError(push.data, "pushData rejected"),
      data: push.data,
    };
  }

  const delivery = await pollDeliveryStatus(params.reference);
  if (!delivery.ok) return delivery;

  const deliveryStatus = delivery.data.deliveryStatus;
  if (isIshareDeliveryFailed(deliveryStatus)) {
    return {
      ok: false,
      status: delivery.status,
      error: deliveryStatus || "Delivery failed",
      data: delivery.data.status,
    };
  }

  if (!isIshareDeliverySuccess(deliveryStatus)) {
    return {
      ok: false,
      status: delivery.status,
      error: deliveryStatus ? `Delivery pending: ${deliveryStatus}` : "Delivery still pending",
      data: delivery.data.status,
    };
  }

  return {
    ok: true,
    status: push.status,
    data: {
      reference: params.reference,
      status: "delivered",
      deliveryStatus,
      balance: push.data.balance,
    },
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
  IshareResult<{
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
      order_code: single.data.reference,
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

export async function pingSupplier(): Promise<IshareResult<IshareBalanceResponse>> {
  return fetchIshareBalance();
}
