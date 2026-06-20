import "server-only";

import crypto from "crypto";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

/**
 * Outbound webhook delivery. Vendors register a single URL + HMAC secret in
 * the developer dashboard. We POST events there so their bots can react
 * (e.g. notify their downstream buyers when orders fulfil) without polling.
 *
 * Signing: HMAC-SHA256 over the raw JSON body, sent as `X-DCS-Signature`.
 * Vendors verify like:
 *   const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
 *   crypto.timingSafeEqual(Buffer.from(req.header("X-DCS-Signature")), Buffer.from(expected));
 */

export type VendorWebhookEvent =
  | "order.queued"
  | "order.processing"
  | "order.fulfilled"
  | "order.failed";

interface DeliverParams {
  vendorId: string;
  event: VendorWebhookEvent;
  reference: string;
  data: Record<string, unknown>;
}

export async function deliverVendorWebhook(params: DeliverParams): Promise<void> {
  if (!hasSupabaseConfig()) return;

  const service = createServiceClient();

  // Skip if we already delivered this event for this order reference successfully.
  const { data: prior } = await service
    .from("vendor_webhook_deliveries")
    .select("id")
    .eq("vendor_id", params.vendorId)
    .eq("event", params.event)
    .eq("reference", params.reference)
    .eq("ok", true)
    .limit(1)
    .maybeSingle();
  if (prior) return;

  const { data: vendor } = await service
    .from("vendors")
    .select("api_webhook_url, api_webhook_secret, api_webhook_enabled")
    .eq("id", params.vendorId)
    .maybeSingle();

  type V = {
    api_webhook_url: string | null;
    api_webhook_secret: string | null;
    api_webhook_enabled: boolean | null;
  };
  const v = vendor as V | null;
  if (!v?.api_webhook_url || v.api_webhook_enabled === false) return;

  const payload = {
    event: params.event,
    reference: params.reference,
    delivered_at: new Date().toISOString(),
    data: params.data,
  };
  const rawBody = JSON.stringify(payload);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "DCS-Elite-Webhook/1.0",
    "X-DCS-Event": params.event,
  };
  if (v.api_webhook_secret) {
    headers["X-DCS-Signature"] = crypto
      .createHmac("sha256", v.api_webhook_secret)
      .update(rawBody)
      .digest("hex");
  }

  let httpStatus: number | null = null;
  let ok = false;
  let responseBody: string | null = null;
  let error: string | null = null;

  try {
    const res = await fetch(v.api_webhook_url, {
      method: "POST",
      headers,
      body: rawBody,
      // Most webhook endpoints respond fast; if they don't, we don't want to
      // hold up our supplier pipeline.
      signal: AbortSignal.timeout(8000),
    });
    httpStatus = res.status;
    ok = res.ok;
    responseBody = (await res.text().catch(() => null))?.slice(0, 1000) ?? null;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  try {
    await service.from("vendor_webhook_deliveries").insert({
      vendor_id: params.vendorId,
      event: params.event,
      reference: params.reference,
      target_url: v.api_webhook_url,
      http_status: httpStatus,
      ok,
      attempts: 1,
      payload: payload as object,
      response_body: responseBody,
      error,
    });
  } catch (err) {
    console.error("[vendor_webhook_deliveries] insert failed", err);
  }
}
