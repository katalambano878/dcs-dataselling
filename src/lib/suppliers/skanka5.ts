import "server-only";

import crypto from "crypto";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierOrderScope } from "./types";

/**
 * Skanka5 — DCS data supplier API client.
 *
 *   docs:  https://agent.skanka5.com/api/v1
 *   auth:  x-api-key header
 *   events: order.items_processed (HMAC-SHA256 over raw body, X-Skanka5-Signature)
 *
 * Every call is logged to `supplier_logs` so the admin debugger can replay
 * any submission, response, or webhook hit.
 */

const SKANKA5_BASE_URL = process.env.SKANKA5_BASE_URL ?? "https://agent.skanka5.com/api/v1";

export type Skanka5NetworkSlug = "mtn" | "telecel" | "at";

export interface Skanka5OrderRow {
  msisdn: string;
  volume_mb: number;
  order_code?: string;
  status?: string;
  price?: number;
  reason?: string | null;
}

export interface Skanka5SubmitResponse {
  success: boolean;
  reference: string;
  status: string;
  accepted: number;
  rejected: number;
  total_cost?: number;
  balance_after?: number;
  orders: Skanka5OrderRow[];
}

export interface Skanka5StatusItem {
  id: number;
  beneficiary_number: string;
  order_reference: string;
  status: number;
  api_status: string;
  api_source: string;
  volume: string;
  network: string;
  price: number;
  created_at: string;
}

export interface Skanka5StatusResponse {
  reference: string;
  items: Skanka5StatusItem[];
}

export type Skanka5Result<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

export function isSkanka5Configured(): boolean {
  return Boolean(process.env.SKANKA5_API_KEY);
}

/** Map our internal network slug to Skanka5 numeric network_id (configurable via env). */
export function getSkanka5NetworkId(network: Skanka5NetworkSlug): number | null {
  const map: Record<Skanka5NetworkSlug, string | undefined> = {
    mtn: process.env.SKANKA5_NETWORK_ID_MTN ?? "3",
    telecel: process.env.SKANKA5_NETWORK_ID_TELECEL,
    at: process.env.SKANKA5_NETWORK_ID_AT,
  };
  const raw = map[network];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Normalize a Ghana phone number to the local 0XXXXXXXXX format Skanka5 expects. */
export function normalizeMsisdn(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

/**
 * Map our catalogue `data_mb` to Skanka5 `volume_mb` values from
 * `/fetch-data-packages` (decimal GB × 1000, e.g. 1GB → 1000).
 *
 * Platform rule: 1 GB = 1000 MB. Legacy binary bundles (1024, 2048…) still
 * round to the same decimal GB.
 */
export function toSkanka5VolumeMb(dataMb: number): number {
  if (!Number.isFinite(dataMb) || dataMb <= 0) return 0;
  return Math.round(dataMb / 1000) * 1000;
}

function extractApiError(parsed: unknown, status: number): string {
  if (!parsed || typeof parsed !== "object") return `HTTP ${status}`;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  const errors = obj.errors;
  if (errors && typeof errors === "object") {
    const parts: string[] = [];
    for (const value of Object.values(errors as Record<string, unknown>)) {
      if (Array.isArray(value)) parts.push(...value.map(String));
      else if (value != null) parts.push(String(value));
    }
    if (parts.length > 0) return parts.join("; ");
  }
  if (typeof obj.error === "string" && obj.error.trim()) return obj.error.trim();
  return `HTTP ${status}`;
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
      supplier: "skanka5",
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
    console.error("[supplier_logs] insert failed", err);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown; idempotencyKey?: string } = {},
): Promise<Skanka5Result<T>> {
  const apiKey = process.env.SKANKA5_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 0, error: "SKANKA5_API_KEY not set" };
  }

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
    Accept: "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  try {
    const res = await fetch(`${SKANKA5_BASE_URL}${path}`, {
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
      return {
        ok: false,
        status: res.status,
        error: extractApiError(parsed, res.status),
        data: parsed,
      };
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
  network: Skanka5NetworkSlug;
  msisdn: string;
  volumeMb: number;
  reference: string;
  scope: SupplierOrderScope;
}

export async function submitSingleOrder(
  params: SubmitSingleParams,
): Promise<Skanka5Result<Skanka5SubmitResponse>> {
  const networkId = getSkanka5NetworkId(params.network);
  const msisdn = normalizeMsisdn(params.msisdn);
  if (!networkId) {
    const error = `No SKANKA5_NETWORK_ID_${params.network.toUpperCase()} configured`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }
  if (!msisdn) {
    const error = `Invalid msisdn: ${params.msisdn}`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const volumeMb =
    params.scope === "console_send"
      ? Math.round(params.volumeMb)
      : toSkanka5VolumeMb(params.volumeMb);
  if (!volumeMb) {
    const error = `Invalid volume_mb for Skanka5: ${params.volumeMb}`;
    await logSupplierEvent({
      eventType: "submit_single",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const body = { network_id: networkId, msisdn, volume_mb: volumeMb };
  const result = await call<Skanka5SubmitResponse>("POST", "/orders", {
    body,
    idempotencyKey: params.reference,
  });

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: result.ok ? result.data.reference : null,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    requestPayload: body,
    responsePayload: result.ok ? (result.data as unknown) : (result.data ?? result.error),
  });

  return result;
}

export interface SubmitBulkParams {
  network: Skanka5NetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: SupplierOrderScope;
}

export async function submitBulkOrder(
  params: SubmitBulkParams,
): Promise<Skanka5Result<Skanka5SubmitResponse>> {
  const networkId = getSkanka5NetworkId(params.network);
  if (!networkId) {
    const error = `No SKANKA5_NETWORK_ID_${params.network.toUpperCase()} configured`;
    await logSupplierEvent({
      eventType: "submit_bulk",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const recipients = params.recipients
    .map((r) => {
      const msisdn = normalizeMsisdn(r.msisdn);
      const volume_mb = toSkanka5VolumeMb(r.volumeMb);
      return msisdn && volume_mb > 0 ? { msisdn, volume_mb } : null;
    })
    .filter((r): r is { msisdn: string; volume_mb: number } => r != null);

  if (recipients.length === 0) {
    const error = "No valid recipients (check phone numbers and bundle sizes)";
    await logSupplierEvent({
      eventType: "submit_bulk",
      scope: params.scope,
      reference: params.reference,
      ok: false,
      error,
    });
    return { ok: false, status: 0, error };
  }

  const body = { network_id: networkId, recipients };
  const result = await call<Skanka5SubmitResponse>("POST", "/orders/bulk", {
    body,
    idempotencyKey: params.reference,
  });

  await logSupplierEvent({
    eventType: "submit_bulk",
    scope: params.scope,
    reference: params.reference,
    supplierReference: result.ok ? result.data.reference : null,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    requestPayload: body,
    responsePayload: result.ok ? (result.data as unknown) : (result.data ?? result.error),
  });

  return result;
}

export async function getOrderStatus(
  supplierReference: string,
): Promise<Skanka5Result<Skanka5StatusResponse>> {
  const result = await call<Skanka5StatusResponse>(
    "GET",
    `/orders/${encodeURIComponent(supplierReference)}`,
  );
  await logSupplierEvent({
    eventType: "status_poll",
    supplierReference,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? (result.data as unknown) : (result.data ?? result.error),
  });
  return result;
}

export async function pingSupplier(): Promise<Skanka5Result<unknown>> {
  const result = await call<unknown>("GET", "/fetch-networks");
  await logSupplierEvent({
    eventType: "ping",
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.error,
  });
  return result;
}

/**
 * Verify the X-Skanka5-Signature header (HMAC-SHA256 hex of the raw request body
 * using the webhook secret). Use a timing-safe comparison.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.SKANKA5_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Logs a webhook delivery for the admin debugger. */
export async function logWebhookEvent(args: {
  ok: boolean;
  supplierReference?: string | null;
  reference?: string | null;
  scope?: SupplierOrderScope | null;
  payload?: unknown;
  error?: string | null;
}) {
  await logSupplierEvent({
    eventType: "webhook",
    scope: args.scope ?? null,
    reference: args.reference ?? null,
    supplierReference: args.supplierReference ?? null,
    ok: args.ok,
    error: args.error ?? null,
    responsePayload: args.payload ?? null,
  });
}
