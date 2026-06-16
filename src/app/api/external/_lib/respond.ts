import "server-only";

import { NextResponse } from "next/server";
import {
  authenticateApiKey,
  getClientIp,
  logApiCall,
  type ApiKeyContext,
} from "@/lib/auth/api-key";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "x-api-key, Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export interface ExternalHandlerContext {
  ctx: ApiKeyContext;
  body: unknown;
  ip: string | null;
  userAgent: string | null;
  params: Record<string, string>;
}

export interface ExternalHandlerResult {
  status?: number;
  success?: boolean;
  message?: string;
  data?: unknown;
  error?: string;
}

export function externalJson(
  result: ExternalHandlerResult,
  status?: number,
): NextResponse {
  const httpStatus = status ?? result.status ?? (result.success === false ? 400 : 200);
  if (result.success === false || result.error) {
    return NextResponse.json(
      { success: false, error: result.error ?? "Request failed" },
      { status: httpStatus, headers: CORS_HEADERS },
    );
  }
  const payload: Record<string, unknown> = { success: true };
  if (result.message) payload.message = result.message;
  if (result.data !== undefined) payload.data = result.data;
  return NextResponse.json(payload, { status: httpStatus, headers: CORS_HEADERS });
}

export function handleExternalApi(
  fn: (handler: ExternalHandlerContext) => Promise<ExternalHandlerResult>,
  options: { method?: string; endpoint?: string } = {},
) {
  return async function handler(
    request: Request,
    routeContext?: { params: Promise<Record<string, string>> },
  ): Promise<Response> {
    const startedAt = performance.now();
    const method = options.method ?? request.method;
    const endpoint =
      options.endpoint ??
      (() => {
        try {
          return new URL(request.url).pathname;
        } catch {
          return request.url;
        }
      })();

    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent");

    const auth = await authenticateApiKey(request);
    if (!auth.ok) {
      await logApiCall({
        endpoint: `${method} ${endpoint}`,
        method,
        httpStatus: auth.status,
        durationMs: Math.round(performance.now() - startedAt),
        ip,
        userAgent,
        error: auth.error,
      });
      return externalJson({ success: false, error: auth.error }, auth.status);
    }

    let body: unknown = null;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      try {
        const text = await request.text();
        body = text ? JSON.parse(text) : null;
      } catch {
        return externalJson({ success: false, error: "Invalid JSON body" }, 400);
      }
    }

    let params: Record<string, string> = {};
    if (routeContext?.params) {
      try {
        params = await routeContext.params;
      } catch {
        // ignore
      }
    }

    try {
      const result = await fn({ ctx: auth.ctx, body, ip, userAgent, params });
      const httpStatus = result.status ?? 200;
      await logApiCall({
        ctx: auth.ctx,
        endpoint: `${method} ${endpoint}`,
        method,
        httpStatus,
        durationMs: Math.round(performance.now() - startedAt),
        ip,
        userAgent,
        requestBody: body,
        responseSummary: result.data,
      });
      return externalJson(result, httpStatus);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Internal error";
      console.error(`[api/external] ${method} ${endpoint}`, err);
      await logApiCall({
        ctx: auth.ctx,
        endpoint: `${method} ${endpoint}`,
        method,
        httpStatus: 500,
        durationMs: Math.round(performance.now() - startedAt),
        ip,
        userAgent,
        requestBody: body,
        error: msg,
      });
      return externalJson({ success: false, error: "Internal error" }, 500);
    }
  };
}

export function externalCorsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Map internal wholesale status to external API labels. */
export function externalOrderStatus(status: string): string {
  switch (status) {
    case "fulfilled":
      return "Completed";
    case "processing":
    case "queued":
      return "Processing";
    case "cancelled":
    case "failed":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function externalItemStatus(status: string): string {
  switch (status) {
    case "fulfilled":
      return "Completed";
    case "processing":
    case "queued":
      return "Processing";
    case "failed":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function normalizeGhanaPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}
