#!/usr/bin/env node
/**
 * Sync live Supabase → staging Postgres for DCS.
 *
 * Usage:
 *   node --env-file=<prod.env> scripts/sync-staging-from-supabase.mjs
 *
 * Requires:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (source)
 *   DATABASE_URL or STAGING_DATABASE_URL                 (target)
 *
 * Auth passwords: existing staging hashes are preserved on conflict.
 * New auth users get a random bcrypt hash (must reset password) unless
 * AUTH_DUMP_JSON points to a JSON array of auth.users rows with encrypted_password.
 */
import fs from "fs";
import path from "path";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

const SOURCE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const SOURCE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TARGET_URL = process.env.STAGING_DATABASE_URL || process.env.DATABASE_URL;
const AUTH_DUMP = process.env.AUTH_DUMP_JSON;

if (!SOURCE_URL || !SOURCE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!TARGET_URL) {
  console.error("Missing DATABASE_URL / STAGING_DATABASE_URL");
  process.exit(1);
}

const TABLES = [
  "networks",
  "marketplace_bundles",
  "wholesale_bundles",
  "platform_settings",
  "platform_stats",
  "profiles",
  "vendors",
  "wallets",
  "vendor_listings",
  "vendor_metrics",
  "vendor_api_keys",
  "vendor_api_logs",
  "vendor_complaints",
  "vendor_console_accounts",
  "vendor_mtn_afa",
  "vendor_referrals",
  "vendor_setup_payments",
  "vendor_webhook_deliveries",
  "vendor_wishlist_items",
  "admin_wishlist_items",
  "wallet_topups",
  "wallet_ledger",
  "orders",
  "transactions",
  "wholesale_orders",
  "wholesale_order_items",
  "momo_sms",
  "sms_logs",
  "notifications",
  "audit_logs",
  "disputes",
  "fulfilment_logs",
  "kyc_documents",
  "payouts",
  "promo_codes",
  "promo_redemptions",
  "promotions",
  "reward_withdrawals",
  "supplier_logs",
  "console_credit_ledger",
  "console_faq",
  "console_pricing_tiers",
  "console_send_ledger",
  "console_support_tickets",
];

async function fetchAll(table) {
  const rows = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const res = await fetch(`${SOURCE_URL}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: SOURCE_KEY,
        Authorization: `Bearer ${SOURCE_KEY}`,
        Range: `${from}-${from + page - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404 || body.includes("does not exist") || body.includes("PGRST205")) {
        console.log(`  skip ${table}: not found`);
        return null;
      }
      throw new Error(`${table}: HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const chunk = await res.json();
    rows.push(...chunk);
    if (chunk.length < page) break;
    from += page;
  }
  return rows;
}

async function fetchAuthUsers() {
  if (AUTH_DUMP && fs.existsSync(AUTH_DUMP)) {
    const rows = JSON.parse(fs.readFileSync(AUTH_DUMP, "utf8"));
    console.log(`auth.users from dump file: ${rows.length}`);
    return rows;
  }

  const users = [];
  let page = 1;
  const perPage = 200;
  for (;;) {
    const res = await fetch(
      `${SOURCE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      {
        headers: {
          apikey: SOURCE_KEY,
          Authorization: `Bearer ${SOURCE_KEY}`,
        },
      },
    );
    if (!res.ok) {
      throw new Error(`auth admin users: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const body = await res.json();
    const batch = body.users || [];
    users.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  console.log(`auth.users from Admin API: ${users.length} (no password hashes)`);
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    phone: u.phone || null,
    encrypted_password: null,
    email_confirmed_at: u.email_confirmed_at || null,
    phone_confirmed_at: u.phone_confirmed_at || null,
    last_sign_in_at: u.last_sign_in_at || null,
    raw_app_meta_data: u.app_metadata || {},
    raw_user_meta_data: u.user_metadata || {},
    created_at: u.created_at,
    updated_at: u.updated_at || u.created_at,
    deleted_at: u.deleted_at || null,
  }));
}

function sqlLiteral(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") {
    const json = JSON.stringify(v).replace(/'/g, "''");
    return `'${json}'::jsonb`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function upsertAuth(client, users) {
  let inserted = 0;
  let updated = 0;
  let placeholderPw = 0;
  for (const u of users) {
    if (!u.id || !u.email) continue;
    const existing = await client.query(
      `SELECT encrypted_password FROM auth.users WHERE id = $1`,
      [u.id],
    );
    let password = u.encrypted_password;
    if (!password) {
      if (existing.rows[0]?.encrypted_password) {
        password = existing.rows[0].encrypted_password;
      } else {
        password = bcrypt.hashSync(randomUUID(), 10);
        placeholderPw += 1;
      }
    }
    const res = await client.query(
      `INSERT INTO auth.users (
         id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, phone, phone_confirmed_at, last_sign_in_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change,
         deleted_at
       ) VALUES (
         $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, '', '', '', '', $12
       )
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         email_confirmed_at = COALESCE(EXCLUDED.email_confirmed_at, auth.users.email_confirmed_at),
         phone_confirmed_at = COALESCE(EXCLUDED.phone_confirmed_at, auth.users.phone_confirmed_at),
         last_sign_in_at = EXCLUDED.last_sign_in_at,
         raw_app_meta_data = EXCLUDED.raw_app_meta_data,
         raw_user_meta_data = EXCLUDED.raw_user_meta_data,
         updated_at = EXCLUDED.updated_at,
         deleted_at = EXCLUDED.deleted_at,
         encrypted_password = CASE
           WHEN EXCLUDED.encrypted_password IS NOT NULL
                AND EXCLUDED.encrypted_password <> ''
                AND position('$2' in EXCLUDED.encrypted_password) = 1
           THEN EXCLUDED.encrypted_password
           ELSE auth.users.encrypted_password
         END`,
      [
        u.id,
        String(u.email).toLowerCase(),
        password,
        u.email_confirmed_at,
        u.phone,
        u.phone_confirmed_at,
        u.last_sign_in_at,
        JSON.stringify(u.raw_app_meta_data || {}),
        JSON.stringify(u.raw_user_meta_data || {}),
        u.created_at || new Date().toISOString(),
        u.updated_at || u.created_at || new Date().toISOString(),
        u.deleted_at,
      ],
    );
    if (existing.rows[0]) updated += 1;
    else inserted += 1;
  }
  console.log(`auth.users upserted: insert=${inserted} update=${updated} newPlaceholderPasswords=${placeholderPw}`);
  if (placeholderPw > 0) {
    console.warn(
      `WARNING: ${placeholderPw} new auth users have placeholder passwords — admin reset required (or re-run with AUTH_DUMP_JSON containing encrypted_password).`,
    );
  }
}

async function replaceTable(client, table, rows) {
  if (rows === null) return;
  const colsRes = await client.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table],
  );
  if (!colsRes.rows.length) {
    console.log(`  skip ${table}: missing on staging`);
    return;
  }
  const colSet = new Set(colsRes.rows.map((c) => c.column_name));
  const typeMap = Object.fromEntries(colsRes.rows.map((c) => [c.column_name, c]));

  if (!rows.length) {
    console.log(`  ${table}: 0`);
    return;
  }

  // Use a stable column set from the first row intersected with staging columns.
  const keys = Object.keys(rows[0]).filter((k) => colSet.has(k));
  if (!keys.length) {
    console.log(`  skip ${table}: no overlapping columns`);
    return;
  }

  const batchSize = 100;
  let n = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const params = [];
    const valueGroups = [];
    let p = 1;
    for (const row of chunk) {
      const placeholders = [];
      for (const k of keys) {
        const meta = typeMap[k];
        let v = row[k];
        const isJson =
          meta?.data_type === "jsonb" ||
          meta?.data_type === "json" ||
          meta?.udt_name === "jsonb";
        if (isJson && v !== null && v !== undefined) {
          if (typeof v === "object") {
            v = JSON.stringify(v);
          } else if (typeof v === "string") {
            try {
              JSON.parse(v);
            } catch {
              // Raw text accidentally stored — wrap as a JSON string.
              v = JSON.stringify(v);
            }
          } else {
            v = JSON.stringify(v);
          }
        }
        params.push(v ?? null);
        if (meta?.data_type === "jsonb" || meta?.udt_name === "jsonb") {
          placeholders.push(`$${p}::jsonb`);
        } else if (meta?.data_type === "json") {
          placeholders.push(`$${p}::json`);
        } else {
          placeholders.push(`$${p}`);
        }
        p += 1;
      }
      valueGroups.push(`(${placeholders.join(",")})`);
    }
    await client.query(
      `INSERT INTO public.${table} (${keys.map((k) => `"${k}"`).join(",")})
       VALUES ${valueGroups.join(",")}`,
      params,
    );
    n += chunk.length;
  }
  console.log(`  ${table}: ${n}`);
}

async function main() {
  console.log("Source:", SOURCE_URL);
  console.log("Target: [DATABASE_URL set]");
  console.log("Dumping auth users...");
  const authUsers = await fetchAuthUsers();

  const dumps = {};
  for (const table of TABLES) {
    process.stdout.write(`dump ${table}... `);
    const rows = await fetchAll(table);
    dumps[table] = rows;
    console.log(rows === null ? "skip" : rows.length);
  }

  const client = new pg.Client({
    connectionString: TARGET_URL,
    ssl: process.env.PGSSL === "require" ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    await client.query("BEGIN");

    console.log("Upserting auth.users...");
    await upsertAuth(client, authUsers);

    const present = TABLES.filter((t) => dumps[t] !== null && dumps[t] !== undefined);
    if (present.length) {
      console.log(`Truncating ${present.length} public tables...`);
      await client.query(
        `TRUNCATE TABLE ${present.map((t) => `public.${t}`).join(", ")} RESTART IDENTITY CASCADE`,
      );
    }

    for (const table of TABLES) {
      await replaceTable(client, table, dumps[table]);
    }

    await client.query("COMMIT");
    console.log("COMMIT ok");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    await client.end();
  }

  // Verify a few counts
  const verify = new pg.Client({ connectionString: TARGET_URL });
  await verify.connect();
  const { rows } = await verify.query(`
    SELECT 'profiles' AS t, count(*)::int AS n FROM profiles
    UNION ALL SELECT 'vendors', count(*)::int FROM vendors
    UNION ALL SELECT 'orders', count(*)::int FROM orders
    UNION ALL SELECT 'wallet_topups', count(*)::int FROM wallet_topups
    UNION ALL SELECT 'wholesale_orders', count(*)::int FROM wholesale_orders
    UNION ALL SELECT 'momo_sms', count(*)::int FROM momo_sms
    UNION ALL SELECT 'auth.users', count(*)::int FROM auth.users
    ORDER BY 1`);
  console.log("Staging after sync:");
  console.table(rows);
  await verify.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
