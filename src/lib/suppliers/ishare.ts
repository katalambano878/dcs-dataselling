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
 * Map an internal volume to the iShare `data` field.
 *
 * VERIFIED LIVE (2026-07-10): `data` is in MB — a push of data=50 deducted
 * exactly 50 from the merchant balance (4,194,254 → 4,194,204). The balance
 * itself is binary MB (4,194,304 = 4 TB), so a 1GB send must push 1024.
 *
 * Console sends store decimal MB (1000 = 1GB) while catalogue orders store
 * binary MB (1024 = 1GB), so only console volumes need converting — same
 * split the railway supplier uses.
 */
export function volumeDataFromMb(volumeMb: number, scope: SupplierOrderScope): string {
  if (!Number.isFinite(volumeMb) || volumeMb <= 0) return "0";
  const binaryMb =
    scope === "console_send" ? Math.round((volumeMb / 1000) * 1024) : Math.round(volumeMb);
  return String(Math.max(1, binaryMb));
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

/**
 * The pushData response is the authoritative success signal: request_status 1
 * with request_status_code "200" and a "Crediting Successful" message means the
 * upstream balance was deducted and the recipient credited.
 *
 * VERIFIED LIVE (2026-07-10): getStatus returns "Failed to deliver" even for
 * pushes whose own response said "Crediting Successful" (and for refs that
 * were never accepted at all), so it must NOT be used to fail/refund a send.
 */
function isPushDelivered(parsed: IsharePushResponse): boolean {
  if (!isRequestAccepted(parsed)) return false;
  const code = parsed.data?.request_status_code;
  if (code && code !== "200") return false;
  const msg = parsed.data?.req_message ?? "";
  return code === "200" || /credit/i.test(msg) || /success/i.test(parsed.request_message ?? "");
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

  const dataMb = volumeDataFromMb(params.volumeMb, params.scope);
  if (Number(dataMb) <= 0) {
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
    data: dataMb,
    share: phone,
  };

  const push = await callIshare<IsharePushResponse>(payload, "pushData");
  const delivered = push.ok && isPushDelivered(push.data);

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: push.ok ? (push.data.data?.req_message ?? params.reference) : params.reference,
    httpStatus: push.status,
    ok: delivered,
    error: delivered ? null : push.ok ? extractError(push.data, "pushData rejected") : push.error,
    requestPayload: payload,
    responsePayload: push.ok ? push.data : push.data,
  });

  if (!push.ok) return push;
  if (!delivered) {
    return {
      ok: false,
      status: push.status,
      error: extractError(push.data, "pushData rejected"),
      data: push.data,
    };
  }

  return {
    ok: true,
    status: push.status,
    data: {
      reference: params.reference,
      status: "delivered",
      deliveryStatus: push.data.data?.req_message ?? "Crediting Successful",
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
