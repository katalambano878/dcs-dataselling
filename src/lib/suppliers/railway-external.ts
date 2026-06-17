import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierNetworkSlug } from "./types";

/**
 * Railway external wholesale API (outbound supplier).
 *   base: RAILWAY_EXTERNAL_BASE_URL (default backend-production Railway URL)
 *   auth: x-api-key header
 *   GET  /products
 *   POST /orders
 *   GET  /orders/:orderId
 *   POST /orders/status
 */

const BASE_URL =
  process.env.RAILWAY_EXTERNAL_BASE_URL?.trim().replace(/\/$/, "") ??
  "https://backend-production-1d8b.up.railway.app/api/external";

export interface RailwayProduct {
  id: string | number;
  name: string;
  description?: string;
  price: number;
  stock?: number;
  sku?: string;
  network?: string;
}

export interface RailwayOrderItem {
  productName?: string;
  mobileNumber?: string;
  status?: string;
  quantity?: number;
}

export interface RailwayOrderData {
  orderId: string | number;
  reference?: string;
  status: string;
  totalPrice?: number;
  walletBalanceAfter?: number;
  items?: RailwayOrderItem[];
  createdAt?: string;
}

export type RailwayResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: unknown };

interface LogInput {
  eventType: "submit_single" | "submit_bulk" | "status_poll" | "ping";
  scope?: "customer_order" | "wholesale_order" | null;
  reference?: string | null;
  supplierReference?: string | null;
  httpStatus?: number | null;
  ok?: boolean | null;
  error?: string | null;
  requestPayload?: unknown;
  responsePayload?: unknown;
}

let productCache: { fetchedAt: number; products: RailwayProduct[] } | null = null;
const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

export function isRailwayExternalConfigured(): boolean {
  return Boolean(process.env.RAILWAY_EXTERNAL_API_KEY?.trim());
}

export function normalizeRailwayPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

async function logSupplierEvent(input: LogInput): Promise<void> {
  if (!hasSupabaseConfig()) return;
  try {
    const service = createServiceClient();
    await service.from("supplier_logs").insert({
      supplier: "railwayexternal",
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
    console.error("[supplier_logs] railwayexternal insert failed", err);
  }
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  init: { body?: unknown } = {},
): Promise<RailwayResult<T>> {
  const apiKey = process.env.RAILWAY_EXTERNAL_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, status: 0, error: "RAILWAY_EXTERNAL_API_KEY not set" };
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
          : undefined) ??
        (parsed && typeof parsed === "object" && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : undefined) ??
        `HTTP ${res.status}`;
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

function detectNetworkFromText(text: string): SupplierNetworkSlug | null {
  const t = text.toLowerCase();
  if (t.includes("telecel") || t.includes("vodafone")) return "telecel";
  if (t.includes("airtel") || t.includes("tigo") || /\bat\b/.test(t) || t.includes("ishare"))
    return "at";
  if (t.includes("mtn")) return "mtn";
  return null;
}

function extractTargetGb(volumeMb: number): number {
  const gb = volumeMb / 1024;
  if (gb <= 0.75) return 1;
  return Math.round(gb);
}

function extractGbFromProductText(text: string): number | null {
  const gbMatch = text.match(/(\d+(?:\.\d+)?)\s*gb/i);
  if (gbMatch) return parseFloat(gbMatch[1]!);
  const mbMatch = text.match(/(\d+)\s*mb/i);
  if (mbMatch) return Number(mbMatch[1]) / 1024;
  return null;
}

function productNetwork(p: RailwayProduct): SupplierNetworkSlug | null {
  if (p.network === "mtn" || p.network === "telecel" || p.network === "at") return p.network;
  return detectNetworkFromText(`${p.name} ${p.description ?? ""}`);
}

export async function fetchRailwayProducts(force = false): Promise<RailwayResult<RailwayProduct[]>> {
  if (
    !force &&
    productCache &&
    Date.now() - productCache.fetchedAt < PRODUCT_CACHE_TTL_MS
  ) {
    return { ok: true, status: 200, data: productCache.products };
  }

  const result = await call<{ success?: boolean; data?: RailwayProduct[] }>("GET", "/products");
  if (!result.ok) return result;

  const products = Array.isArray(result.data.data) ? result.data.data : [];
  productCache = { fetchedAt: Date.now(), products };
  return { ok: true, status: result.status, data: products };
}

export async function resolveRailwayProductId(
  network: SupplierNetworkSlug,
  volumeMb: number,
): Promise<{ productId: string | number } | { error: string }> {
  const envKey = `RAILWAY_PRODUCT_ID_${network.toUpperCase()}_${extractTargetGb(volumeMb)}GB`;
  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv) return { productId: fromEnv };

  const catalog = await fetchRailwayProducts();
  if (!catalog.ok) return { error: catalog.error };

  const targetGb = extractTargetGb(volumeMb);
  const candidates = catalog.data
    .map((p) => {
      const net = productNetwork(p);
      const gb = extractGbFromProductText(`${p.name} ${p.description ?? ""}`);
      return { p, net, gb };
    })
    .filter((row) => row.net === network && row.gb != null);

  const exact = candidates.find((c) => Math.round(c.gb!) === targetGb);
  if (exact) return { productId: exact.p.id };

  const closest = candidates.sort(
    (a, b) => Math.abs(a.gb! - targetGb) - Math.abs(b.gb! - targetGb),
  )[0];
  if (closest && Math.abs(closest.gb! - targetGb) <= 0.5) {
    return { productId: closest.p.id };
  }

  return {
    error: `No Railway product for ${network} ~${targetGb}GB (${volumeMb}MB). Set ${envKey} or sync product names.`,
  };
}

export interface SubmitSingleParams {
  network: SupplierNetworkSlug;
  msisdn: string;
  volumeMb: number;
  reference: string;
  scope: "customer_order" | "wholesale_order";
}

export async function submitSingleOrder(
  params: SubmitSingleParams,
): Promise<RailwayResult<{ reference: string; orderId: string; status: string; items: RailwayOrderItem[] }>> {
  const phone = normalizeRailwayPhone(params.msisdn);
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

  const resolved = await resolveRailwayProductId(params.network, params.volumeMb);
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
    items: [{ productId: resolved.productId, quantity: 1, mobileNumber: phone }],
  };

  const result = await call<{ success?: boolean; message?: string; data?: RailwayOrderData; error?: string }>(
    "POST",
    "/orders",
    { body },
  );

  const data = result.ok ? result.data.data : undefined;
  const orderId = data?.orderId != null ? String(data.orderId) : null;
  const success = Boolean(result.ok && result.data.success !== false && orderId);

  await logSupplierEvent({
    eventType: "submit_single",
    scope: params.scope,
    reference: params.reference,
    supplierReference: orderId,
    httpStatus: result.status,
    ok: success,
    error: success
      ? null
      : result.ok
        ? (result.data.error ?? result.data.message ?? "Order rejected")
        : result.error,
    requestPayload: body,
    responsePayload: result.ok ? result.data : result.data,
  });

  if (!result.ok) return result;
  if (!success || !orderId) {
    return {
      ok: false,
      status: result.status,
      error: result.data.error ?? result.data.message ?? "Order rejected",
      data: result.data,
    };
  }

  return {
    ok: true,
    status: result.status,
    data: {
      reference: orderId,
      orderId,
      status: data!.status ?? "Pending",
      items: data!.items ?? [],
    },
  };
}

export interface SubmitBulkParams {
  network: SupplierNetworkSlug;
  recipients: Array<{ msisdn: string; volumeMb: number }>;
  reference: string;
  scope: "customer_order" | "wholesale_order";
}

/** Railway accepts multiple line items in one POST /orders call. */
export async function submitBulkOrders(
  params: SubmitBulkParams,
): Promise<
  RailwayResult<{
    reference: string;
    orders: Array<{ order_code?: string; msisdn?: string; status?: string }>;
  }>
> {
  const items: Array<{ productId: string | number; quantity: number; mobileNumber: string }> = [];
  const rows: Array<{ order_code?: string; msisdn?: string; status?: string }> = [];

  for (const r of params.recipients) {
    const phone = normalizeRailwayPhone(r.msisdn);
    if (!phone) {
      rows.push({ msisdn: r.msisdn, status: "failed" });
      continue;
    }
    const resolved = await resolveRailwayProductId(params.network, r.volumeMb);
    if ("error" in resolved) {
      rows.push({ msisdn: r.msisdn, status: "failed" });
      continue;
    }
    items.push({ productId: resolved.productId, quantity: 1, mobileNumber: phone });
  }

  if (items.length === 0) {
    return { ok: false, status: 0, error: "No valid recipients or products" };
  }

  const body = { items };
  const result = await call<{ success?: boolean; data?: RailwayOrderData; error?: string; message?: string }>(
    "POST",
    "/orders",
    { body },
  );

  const data = result.ok ? result.data.data : undefined;
  const orderId = data?.orderId != null ? String(data.orderId) : null;
  const success = Boolean(result.ok && result.data.success !== false && orderId);

  await logSupplierEvent({
    eventType: "submit_bulk",
    scope: params.scope,
    reference: params.reference,
    supplierReference: orderId,
    httpStatus: result.status,
    ok: success,
    error: success
      ? null
      : result.ok
        ? (result.data.error ?? result.data.message ?? "Bulk rejected")
        : result.error,
    requestPayload: body,
    responsePayload: result.ok ? result.data : result.data,
  });

  if (!success || !orderId) {
    return {
      ok: false,
      status: result.ok ? result.status : 0,
      error: result.ok
        ? (result.data.error ?? result.data.message ?? "Bulk rejected")
        : result.error,
      data: result.data,
    };
  }

  const supplierItems = data!.items ?? [];
  for (let i = 0; i < params.recipients.length; i++) {
    const r = params.recipients[i]!;
    const item = supplierItems[i];
    rows.push({
      order_code: orderId,
      msisdn: r.msisdn,
      status: item?.status ?? data!.status ?? "Pending",
    });
  }

  return {
    ok: true,
    status: result.status,
    data: { reference: orderId, orders: rows },
  };
}

export async function pollOrderStatus(
  orderId: string,
): Promise<RailwayResult<{ status: string; items: RailwayOrderItem[] }>> {
  const result = await call<{ success?: boolean; data?: RailwayOrderData }>(
    "GET",
    `/orders/${encodeURIComponent(orderId)}`,
  );

  await logSupplierEvent({
    eventType: "status_poll",
    supplierReference: orderId,
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? result.data : result.data,
  });

  if (!result.ok) return result;
  const data = result.data.data;
  if (!data) {
    return { ok: false, status: result.status, error: "Empty order response" };
  }
  return {
    ok: true,
    status: result.status,
    data: { status: data.status, items: data.items ?? [] },
  };
}

export async function pollOrdersStatusBulk(
  orderIds: string[],
): Promise<RailwayResult<Array<{ orderId: string; status: string; items: RailwayOrderItem[] }>>> {
  const result = await call<{ success?: boolean; data?: RailwayOrderData[] }>("POST", "/orders/status", {
    body: { orderIds },
  });

  await logSupplierEvent({
    eventType: "status_poll",
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    requestPayload: { orderIds },
    responsePayload: result.ok ? result.data : result.data,
  });

  if (!result.ok) return result;
  const rows = Array.isArray(result.data.data) ? result.data.data : [];
  return {
    ok: true,
    status: result.status,
    data: rows.map((row) => ({
      orderId: String(row.orderId),
      status: row.status,
      items: row.items ?? [],
    })),
  };
}

export async function pingSupplier(): Promise<RailwayResult<{ productCount: number; sample: RailwayProduct[] }>> {
  const result = await fetchRailwayProducts(true);
  await logSupplierEvent({
    eventType: "ping",
    httpStatus: result.status,
    ok: result.ok,
    error: result.ok ? null : result.error,
    responsePayload: result.ok ? { count: result.data.length } : result.data,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    status: result.status,
    data: { productCount: result.data.length, sample: result.data.slice(0, 5) },
  };
}

export function mapRailwayStatus(status: string): "fulfilled" | "failed" | "processing" {
  const s = status.toLowerCase();
  if (["completed", "complete", "success", "fulfilled", "delivered"].includes(s)) return "fulfilled";
  if (["cancelled", "canceled", "failed"].includes(s)) return "failed";
  return "processing";
}

export function railwayOrderIdToCodes(orderId: string): string[] {
  return [orderId];
}
