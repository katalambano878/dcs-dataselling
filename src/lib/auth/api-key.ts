import "server-only";

import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

/**
 * Bearer-token authentication for the public DCS Elite developer API
 * (/api/v1/*). Keys are issued from the vendor's "Developer" dashboard,
 * scoped to a single vendor, and hashed at rest with SHA-256.
 */

import type { VendorTier } from "@/types";

export interface ApiKeyContext {
  keyId: string;
  keyPrefix: string;
  vendorId: string;
  vendorEmail: string | null;
  vendorSlug: string;
  vendorName: string;
  vendorTier: VendorTier;
}

export type ApiKeyResult =
  | { ok: true; ctx: ApiKeyContext }
  | { ok: false; status: number; error: string; code: string };

function hashKey(plain: string): string {
  return crypto.createHash("sha256").update(plain).digest("hex");
}

/** Extract API key from x-api-key header or Authorization: Bearer. */
export function extractApiKey(request: Request | NextRequest): string | null {
  const xKey = request.headers.get("x-api-key")?.trim();
  if (xKey) return xKey.length > 0 ? xKey : null;

  const auth = request.headers.get("authorization");
  if (!auth) return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

/** Best-effort client IP extraction across reverse proxies. */
export function getClientIp(request: Request | NextRequest): string | null {
  const h = request.headers;
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-vercel-forwarded-for") ??
    null
  );
}

/** Authenticate a request using the Authorization: Bearer header. */
export async function authenticateApiKey(
  request: Request | NextRequest,
): Promise<ApiKeyResult> {
  if (!hasSupabaseConfig()) {
    return { ok: false, status: 503, error: "Service unavailable", code: "not_configured" };
  }

  const token = extractApiKey(request);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Missing API key. Send 'Authorization: Bearer <your_key>'.",
      code: "missing_key",
    };
  }

  if (!token.startsWith("dcs_") || token.length < 16) {
    return {
      ok: false,
      status: 401,
      error: "Malformed API key.",
      code: "malformed_key",
    };
  }

  const service = createServiceClient();
  const hash = hashKey(token);

  const { data, error } = await service
    .from("vendor_api_keys")
    .select(
      `
      id, vendor_id, key_prefix, active, revoked_at, expires_at,
      vendors ( id, slug, business_name, user_id, setup_fee_paid_at, tier, status, api_only )
    `,
    )
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) {
    console.error("[api-key lookup]", error);
    return { ok: false, status: 500, error: "Auth lookup failed", code: "lookup_failed" };
  }

  if (!data) {
    return { ok: false, status: 401, error: "Invalid API key.", code: "invalid_key" };
  }

  type KeyRow = {
    id: string;
    vendor_id: string;
    key_prefix: string;
    active: boolean;
    revoked_at: string | null;
    expires_at: string | null;
    vendors:
      | VendorJoin
      | VendorJoin[]
      | null;
  };
  type VendorJoin = {
    id: string;
    slug: string;
    business_name: string;
    user_id: string;
    setup_fee_paid_at: string | null;
    tier: VendorTier | null;
    status: string | null;
    api_only: boolean | null;
  };
  const row = data as KeyRow;

  if (!row.active || row.revoked_at) {
    return { ok: false, status: 401, error: "API key revoked.", code: "revoked" };
  }

  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return { ok: false, status: 401, error: "API key expired.", code: "expired" };
  }

  const vendor = Array.isArray(row.vendors) ? row.vendors[0] : row.vendors;
  if (!vendor) {
    return { ok: false, status: 401, error: "Vendor account not found.", code: "no_vendor" };
  }

  if (vendor.api_only) {
    // API-only accounts skip the store setup fee but must be approved by an
    // admin before their keys are allowed to call the API.
    if (vendor.status !== "approved") {
      return {
        ok: false,
        status: 403,
        error: "API access is pending admin approval.",
        code: "pending_approval",
      };
    }
  } else if (!vendor.setup_fee_paid_at) {
    return {
      ok: false,
      status: 403,
      error: "Vendor store setup is incomplete.",
      code: "setup_incomplete",
    };
  }

  // Resolve vendor's auth email (best-effort, used only by some endpoints).
  let vendorEmail: string | null = null;
  try {
    const { data: profile } = await service
      .from("profiles")
      .select("email")
      .eq("id", vendor.user_id)
      .maybeSingle();
    vendorEmail = (profile as { email: string } | null)?.email ?? null;
  } catch {
    // ignored
  }

  return {
    ok: true,
    ctx: {
      keyId: row.id,
      keyPrefix: row.key_prefix,
      vendorId: vendor.id,
      vendorEmail,
      vendorSlug: vendor.slug,
      vendorName: vendor.business_name,
      vendorTier: vendor.tier ?? "starter",
    },
  };
}

interface LogArgs {
  ctx?: ApiKeyContext;
  vendorId?: string;
  keyId?: string | null;
  keyPrefix?: string | null;
  endpoint: string;
  method: string;
  httpStatus: number;
  durationMs?: number;
  ip?: string | null;
  userAgent?: string | null;
  requestBody?: unknown;
  responseSummary?: unknown;
  error?: string | null;
}

/** Redact sensitive fields out of the request body before persisting. */
function redactBody(body: unknown): unknown {
  if (body == null || typeof body !== "object") return body;
  const SENSITIVE = new Set(["authorization", "password", "secret", "api_key", "apikey", "token"]);
  function walk(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = SENSITIVE.has(k.toLowerCase()) ? "[REDACTED]" : walk(v);
      }
      return out;
    }
    return value;
  }
  return walk(body);
}

/** Record an API call in vendor_api_logs and bump key counters. */
export async function logApiCall(args: LogArgs): Promise<void> {
  if (!hasSupabaseConfig()) return;
  const vendorId = args.vendorId ?? args.ctx?.vendorId;
  if (!vendorId) return;

  const keyId = args.keyId ?? args.ctx?.keyId ?? null;
  const keyPrefix = args.keyPrefix ?? args.ctx?.keyPrefix ?? null;

  try {
    const service = createServiceClient();
    await service.from("vendor_api_logs").insert({
      vendor_id: vendorId,
      key_id: keyId,
      key_prefix: keyPrefix,
      endpoint: args.endpoint,
      method: args.method,
      http_status: args.httpStatus,
      duration_ms: args.durationMs ?? null,
      ip: args.ip ?? null,
      user_agent: args.userAgent?.slice(0, 500) ?? null,
      request_body: redactBody(args.requestBody) as object,
      response_summary: (args.responseSummary as object | undefined) ?? null,
      error: args.error ?? null,
    });

    if (keyId && args.httpStatus < 500) {
      // Non-atomic increment is fine for usage stats; logs table is the source of truth.
      const { data: keyRow } = await service
        .from("vendor_api_keys")
        .select("total_requests")
        .eq("id", keyId)
        .maybeSingle();
      const current = Number((keyRow as { total_requests: number } | null)?.total_requests ?? 0);
      await service
        .from("vendor_api_keys")
        .update({
          last_used_at: new Date().toISOString(),
          last_used_ip: args.ip ?? null,
          total_requests: current + 1,
        })
        .eq("id", keyId);
    }
  } catch (err) {
    console.error("[vendor_api_logs] insert failed", err);
  }
}
