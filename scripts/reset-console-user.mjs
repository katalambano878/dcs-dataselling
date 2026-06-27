/**
 * Reset a user's console balance to zero and remove demo setup credits.
 * Usage: node --env-file=.env.local scripts/reset-console-user.mjs <email>
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.argv[2] ?? "").trim().toLowerCase();

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!email) {
  console.error("Usage: node --env-file=.env.local scripts/reset-console-user.mjs <email>");
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

const { data: vendor } = await supabase
  .from("vendors")
  .select("id, slug")
  .eq("user_id", userId)
  .maybeSingle();

if (!vendor) {
  console.log("No vendor linked to", email);
  process.exit(0);
}

const { error: ledgerErr } = await supabase
  .from("console_credit_ledger")
  .delete()
  .eq("vendor_id", vendor.id)
  .or("note.eq.Console demo setup,reference.like.SETUP-%");

if (ledgerErr) {
  console.error("delete ledger failed:", ledgerErr.message);
  process.exit(1);
}

const { error: acctErr } = await supabase
  .from("vendor_console_accounts")
  .update({
    balance_mb: 0,
    enabled: false,
    total_sends: 0,
    updated_at: new Date().toISOString(),
  })
  .eq("vendor_id", vendor.id);

if (acctErr) {
  console.error("reset account failed:", acctErr.message);
  process.exit(1);
}

console.log("Reset console for", email, `(@${vendor.slug}): balance 0, disabled.`);
