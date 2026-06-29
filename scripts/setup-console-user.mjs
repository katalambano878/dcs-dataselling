/**
 * Link a user to a vendor (if needed). Optionally allocate console credit (production: use admin UI).
 * Usage: node --env-file=.env.local scripts/setup-console-user.mjs <email> [gb]
 * Omit gb (or pass 0) to create/link vendor only — no credit is added.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] ?? "").trim().toLowerCase();
const gbArg = process.argv[3];
const gb = gbArg === undefined ? 0 : Number(gbArg);

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/setup-console-user.mjs <email> [gb]");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let userId;
let page = 1;
for (;;) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("listUsers failed:", error.message);
    process.exit(1);
  }
  const found = data.users.find((u) => u.email?.toLowerCase() === email);
  if (found) {
    userId = found.id;
    break;
  }
  if (data.users.length < 1000) break;
  page += 1;
}

if (!userId) {
  console.error("User not found:", email);
  process.exit(1);
}

const { data: existingVendor } = await supabase
  .from("vendors")
  .select("id, slug, business_name, status")
  .eq("user_id", userId)
  .maybeSingle();

let vendorId = existingVendor?.id;

if (!vendorId) {
  const slug = `console-${userId.slice(0, 8)}`;
  const { data: inserted, error } = await supabase
    .from("vendors")
    .insert({
      user_id: userId,
      slug,
      business_name: "Console Agent",
      api_only: true,
      status: "approved",
      verified: true,
      kyc_status: "verified",
      tier: "pro",
    })
    .select("id, slug")
    .single();

  if (error || !inserted) {
    console.error("create vendor failed:", error?.message);
    process.exit(1);
  }
  vendorId = inserted.id;
  console.log("Created vendor:", inserted.slug, vendorId);
} else {
  console.log("Using existing vendor:", existingVendor.slug, vendorId);
}

if (gb <= 0) {
  const { data: acct } = await supabase
    .from("vendor_console_accounts")
    .select("vendor_id")
    .eq("vendor_id", vendorId)
    .maybeSingle();
  if (!acct) {
    await supabase.from("vendor_console_accounts").insert({
      vendor_id: vendorId,
      enabled: false,
      balance_mb: 0,
    });
  }
  console.log("Vendor linked. No credit allocated — use Admin → Data Consoles to allocate GB.");
  process.exit(0);
}

const amountMb = gb * 1000;
const reference = `SETUP-${Date.now()}`;

const { data: acct } = await supabase
  .from("vendor_console_accounts")
  .select("balance_mb")
  .eq("vendor_id", vendorId)
  .maybeSingle();

const current = Number(acct?.balance_mb ?? 0);
const next = +(current + amountMb).toFixed(2);

if (!acct) {
  await supabase.from("vendor_console_accounts").insert({
    vendor_id: vendorId,
    enabled: true,
    balance_mb: next,
  });
} else {
  await supabase
    .from("vendor_console_accounts")
    .update({ enabled: true, balance_mb: next, updated_at: new Date().toISOString() })
    .eq("vendor_id", vendorId);
}

await supabase.from("console_credit_ledger").insert({
  vendor_id: vendorId,
  amount_mb: amountMb,
  balance_after_mb: next,
  reference,
  note: "Console setup",
  created_by: userId,
});

console.log("Console enabled with", gb, "GB (", next, "MB total ).");
console.log("Login at https://console.dcselite.com/auth/login?next=/console");
