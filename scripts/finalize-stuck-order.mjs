/**
 * Recover a Paystack-paid storefront order stuck in `pending`, then dispatch via DataCoreGH.
 * Usage: node scripts/finalize-stuck-order.mjs DCS-20260612-XILFBT
 */
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const ref = process.argv[2];
if (!ref) {
  console.error("Usage: node scripts/finalize-stuck-order.mjs <reference>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function fetchBundle(bundleId) {
  const { data: listing } = await service
    .from("vendor_listings")
    .select("custom_name, wholesale_bundles ( name, network, data_mb )")
    .eq("id", bundleId)
    .maybeSingle();
  if (listing?.wholesale_bundles) {
    const wb = Array.isArray(listing.wholesale_bundles)
      ? listing.wholesale_bundles[0]
      : listing.wholesale_bundles;
    return { name: listing.custom_name || wb.name, network: wb.network, data_mb: wb.data_mb };
  }
  return null;
}

function normalizeMsisdn(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233")) return digits;
  if (digits.startsWith("0")) return `233${digits.slice(1)}`;
  return digits;
}

const verifyRes = await fetch(
  `https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,
  { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } },
);
const verify = await verifyRes.json();
if (!verify.status || verify.data?.status !== "success") {
  console.error("Paystack verify failed", verify);
  process.exit(1);
}

const { data: order } = await service
  .from("orders")
  .select("id, status, bundle_id, recipient_phone, supplier_reference")
  .eq("reference", ref)
  .maybeSingle();

if (!order) {
  console.error("Order not found");
  process.exit(1);
}

console.log("Before:", order);

if (order.status === "pending") {
  const now = new Date().toISOString();
  await service
    .from("orders")
    .update({ status: "paid", paid_at: now, payment_reference: ref })
    .eq("id", order.id)
    .eq("status", "pending");

  await service.from("transactions").insert({
    order_id: order.id,
    provider: "paystack",
    provider_reference: ref,
    amount: verify.data.amount / 100,
    status: "success",
    raw_payload: verify.data,
  });

  await service.from("orders").update({ status: "queued" }).eq("id", order.id);
  order.status = "queued";
}

if (order.supplier_reference) {
  console.log("Already dispatched:", order.supplier_reference);
  process.exit(0);
}

const bundle = await fetchBundle(order.bundle_id);
console.log("Bundle:", bundle);
if (!bundle) {
  console.error("Bundle missing");
  process.exit(1);
}

const msisdn = normalizeMsisdn(order.recipient_phone);
const volumeGb = Math.max(1, Math.round(bundle.data_mb / 1024));
const offerSlug = bundle.network === "telecel" ? "telecel" : bundle.network === "at" ? "ishare" : "mtn";
const networkPath = bundle.network === "at" ? "at" : bundle.network;

const dispatchRes = await fetch(`${env.SUCCESSBIZHUB_BASE_URL}/order/${networkPath}`, {
  method: "POST",
  headers: {
    "x-api-key": env.SUCCESSBIZHUB_API_KEY,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify({
    type: "single",
    volume: volumeGb,
    phone: msisdn,
    offerSlug,
    metadata: { idempotencyKey: ref },
    webhookUrl: "https://www.dcselite.com/api/webhooks/successbizhub",
  }),
});

const dispatchBody = await dispatchRes.json().catch(() => ({}));
console.log("DataCoreGH:", dispatchRes.status, dispatchBody);

if (dispatchRes.ok && dispatchBody?.success !== false) {
  await service
    .from("orders")
    .update({
      status: "processing",
      supplier: "successbizhub",
      supplier_reference: dispatchBody.reference ?? dispatchBody.data?.reference ?? null,
      supplier_order_code: dispatchBody.orderId ?? dispatchBody.data?.orderId ?? null,
      supplier_status: dispatchBody.status ?? "accepted",
      supplier_submitted_at: new Date().toISOString(),
      supplier_error: null,
    })
    .eq("id", order.id);
} else {
  await service
    .from("orders")
    .update({
      supplier: "successbizhub",
      supplier_status: "failed",
      supplier_error: JSON.stringify(dispatchBody).slice(0, 500),
      supplier_submitted_at: new Date().toISOString(),
    })
    .eq("id", order.id);
}

const { data: after } = await service
  .from("orders")
  .select("reference, status, supplier_status, supplier_reference, supplier_error")
  .eq("id", order.id)
  .single();
console.log("After:", after);
