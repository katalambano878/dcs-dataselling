import { NextResponse, after } from "next/server";

import { getMomoDirectConfig } from "@/lib/data/platform-config";
import {
  autoMatchOrderForSms,
  parseMomoSms,
  recordMomoSms,
} from "@/lib/payments/momo-direct";
import { finalizeMomoDirectOrder } from "@/lib/payments/momo-direct-fulfilment";
import {
  autoMatchWalletTopupForSms,
  finalizeMomoWalletTopup,
} from "@/lib/payments/wallet-momo-claim";
import { smsWalletTopup } from "@/lib/notifications/sms";
import { isSmsForwarderAuthorized } from "@/lib/payments/sms-forwarder-auth";

export const dynamic = "force-dynamic";

/**
 * Receiver for the Forward-SMS Android app running on the dedicated MoMo
 * phone. Accepts either:
 *
 *   - application/json body: { sender, body, receivedAt? }
 *   - x-www-form-urlencoded:  sender=…&body=…&receivedAt=…
 *
 * Authentication (any one of these):
 *   - `Authorization: Bearer <smsForwarderSecret>`
 *   - `Authorization: <smsForwarderSecret>` (raw secret, no Bearer prefix)
 *   - `X-SMS-Forwarder-Secret: <smsForwarderSecret>` or `X-Api-Key: <smsForwarderSecret>`
 *   - Query param `?secret=<smsForwarderSecret>` (for apps that cannot set headers)
 *   - Secret is configured at /admin/settings (platform_config.momoDirect.smsForwarderSecret)
 *
 * The endpoint always returns 200 once authenticated so the SMS forwarder
 * marks the message as delivered and doesn't retry forever. Parse failures
 * are stored in `momo_sms` with parse_status='unparsed' and surface in
 * /admin/momo-payments for manual resolution.
 */
export async function POST(request: Request) {
  const config = await getMomoDirectConfig();

  if (!config.smsForwarderSecret) {
    return NextResponse.json(
      { error: "MoMo direct not configured. Set smsForwarderSecret in /admin/settings." },
      { status: 503 },
    );
  }

  if (!isSmsForwarderAuthorized(request, config.smsForwarderSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sender: string | null = null;
  let body: string | null = null;
  let receivedAtRaw: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = (await request.json()) as {
        sender?: string;
        from?: string;
        body?: string;
        message?: string;
        text?: string;
        receivedAt?: string;
        timestamp?: string;
      };
      sender = json.sender ?? json.from ?? null;
      body = json.body ?? json.message ?? json.text ?? null;
      receivedAtRaw = json.receivedAt ?? json.timestamp ?? null;
    } else {
      const form = await request.formData();
      sender = (form.get("sender") ?? form.get("from") ?? null) as string | null;
      body =
        (form.get("body") ?? form.get("message") ?? form.get("text") ?? null) as string | null;
      receivedAtRaw = (form.get("receivedAt") ?? form.get("timestamp") ?? null) as string | null;
    }
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!body || typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "Missing SMS body" }, { status: 400 });
  }

  const parsed = parseMomoSms(body, sender);
  if (receivedAtRaw) {
    const d = new Date(receivedAtRaw);
    if (!Number.isNaN(d.getTime())) parsed.receivedAt = d;
  }
  if (!parsed.receivedAt) parsed.receivedAt = new Date();

  const smsId = await recordMomoSms({ rawBody: body, senderId: sender, parsed });
  if (!smsId) {
    // Duplicate transaction_id (already received this exact SMS) — treat as success.
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Try to auto-match this SMS to a pending awaiting_momo order. If we find one,
  // finalize it (flip to paid, dispatch to supplier, send SMS to customer).
  const matchedOrderId = await autoMatchOrderForSms(smsId);
  let finalized = false;
  if (matchedOrderId && parsed.transactionId) {
    finalized = await finalizeMomoDirectOrder(matchedOrderId, parsed.transactionId);
  }

  let matchedWalletTopupId: string | null = null;
  let walletTopupFinalized = false;
  if (!matchedOrderId) {
    matchedWalletTopupId = await autoMatchWalletTopupForSms(smsId);
    if (matchedWalletTopupId && parsed.transactionId) {
      const completion = await finalizeMomoWalletTopup(
        matchedWalletTopupId,
        parsed.transactionId,
        parsed.amount ?? null,
      );
      walletTopupFinalized = completion != null;
      if (completion?.notifyPhone) {
        const notify = completion.notifyPhone;
        after(() =>
          smsWalletTopup({
            phone: notify,
            amount: completion.amount,
            reference: completion.reference,
          }),
        );
      }
    }
  }

  return NextResponse.json({
    received: true,
    sms_id: smsId,
    parsed: {
      network: parsed.network,
      transactionId: parsed.transactionId,
      amount: parsed.amount,
    },
    matched_order_id: matchedOrderId,
    finalized,
    matched_wallet_topup_id: matchedWalletTopupId,
    wallet_topup_finalized: walletTopupFinalized,
  });
}
