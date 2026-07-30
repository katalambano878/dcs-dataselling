#!/usr/bin/env node
/**
 * Merge selected keys from a source .env into a Coolify app .env,
 * without overwriting staging-critical URL/DB settings.
 *
 * Usage:
 *   node scripts/merge-coolify-env.mjs <source.env> <coolify.env>
 */
import fs from "fs";

const sourcePath = process.argv[2];
const targetPath = process.argv[3];
if (!sourcePath || !targetPath) {
  console.error("Usage: node merge-coolify-env.mjs <source.env> <coolify.env>");
  process.exit(1);
}

const PRESERVE = new Set([
  "DATABASE_URL",
  "POSTGRES_URL",
  "NEXT_PUBLIC_SUPABASE_URL", // staging points at itself for shims
  "NEXT_PUBLIC_APP_URL",
  "STORAGE_PUBLIC_URL",
  "STORAGE_ROOT",
  "COOLIFY_BRANCH",
  "COOLIFY_CONTAINER_NAME",
  "COOLIFY_FQDN",
  "COOLIFY_RESOURCE_UUID",
  "COOLIFY_URL",
  "SOURCE_COMMIT",
  "HOST",
  "PORT",
  "NODE_ENV",
  "CI",
]);

const ALLOW = new Set([
  "AUTH_JWT_SECRET",
  "JWT_SECRET",
  "SUPABASE_JWT_SECRET",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_CONSOLE_URL",
  "NEXT_PUBLIC_CONSOLE_HOST",
  "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY",
  "PAYSTACK_SECRET_KEY",
  "ARKESEL_API_KEY",
  "ARKESEL_SENDER_ID",
  "ISHARE_API_KEY",
  "ISHARE_MERCHANT_SLUG",
  "ISHARE_BASE_URL",
  "RAILWAY_EXTERNAL_API_KEY",
  "RAILWAY_EXTERNAL_BASE_URL",
  "SKANKA5_API_KEY",
  "SKANKA5_WEBHOOK_SECRET",
  "SKANKA5_ALLOW_UNSIGNED_WEBHOOKS",
  "SKANKA5_NETWORK_ID_MTN",
  "SKANKA5_NETWORK_ID_TELECEL",
  "SKANKA5_NETWORK_ID_AT",
  "SKANKA5_BASE_URL",
  "SUCCESSBIZHUB_API_KEY",
  "SUCCESSBIZHUB_BASE_URL",
  "SUCCESSBIZHUB_OFFER_SLUG_MTN",
  "SUCCESSBIZHUB_OFFER_SLUG_TELECEL",
  "SUCCESSBIZHUB_OFFER_SLUG_AT",
  "SUCCESSBIZHUB_WEBHOOK_URL",
  "SUPPLIER_FOR_MTN",
  "SUPPLIER_FOR_TELECEL",
  "SUPPLIER_FOR_AT",
  "VENDOR_STORE_SETUP_FEE_GHS",
  "NEXT_PUBLIC_VENDOR_STORE_SETUP_FEE_GHS",
  "CRON_SECRET",
  "STORAGE_SIGNING_SECRET",
  "NEXT_PUBLIC_USE_PLAIN_PG",
  "PG_POOL_MAX",
  "PGSSL",
]);

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const k = trimmed.slice(0, i).trim();
    let v = trimmed.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    map.set(k, v);
  }
  return map;
}

function quote(v) {
  if (/[\s#"'\\]/.test(v)) return `'${v.replace(/'/g, `'\\''`)}'`;
  return `'${v}'`;
}

const source = parseEnv(fs.readFileSync(sourcePath, "utf8"));
const targetText = fs.readFileSync(targetPath, "utf8");
const target = parseEnv(targetText);

const updated = [];
const skipped = [];
for (const [k, v] of source.entries()) {
  if (!ALLOW.has(k)) {
    skipped.push(`${k} (not in allow list)`);
    continue;
  }
  if (PRESERVE.has(k)) {
    skipped.push(`${k} (preserved staging value)`);
    continue;
  }
  if (!v) {
    skipped.push(`${k} (empty)`);
    continue;
  }
  // Never point staging SITE_URL at localhost
  if (
    (k === "NEXT_PUBLIC_SITE_URL" || k === "NEXT_PUBLIC_CONSOLE_URL") &&
    /localhost|127\.0\.0\.1/i.test(v)
  ) {
    skipped.push(`${k} (localhost skipped)`);
    continue;
  }
  const prev = target.get(k);
  target.set(k, v);
  updated.push(prev === v ? `${k} (unchanged)` : k);
}

// Ensure plain-PG flags stay correct for staging
if (!target.get("NEXT_PUBLIC_USE_PLAIN_PG")) {
  target.set("NEXT_PUBLIC_USE_PLAIN_PG", "true");
  updated.push("NEXT_PUBLIC_USE_PLAIN_PG");
}

const lines = [];
for (const [k, v] of target.entries()) {
  lines.push(`${k}=${quote(v)}`);
}
fs.writeFileSync(targetPath, lines.join("\n") + "\n", "utf8");

console.log("Updated keys:", updated.filter((k) => !k.includes("unchanged")).join(", ") || "(none)");
console.log("Unchanged:", updated.filter((k) => k.includes("unchanged")).length);
console.log("Skipped:", skipped.length);
