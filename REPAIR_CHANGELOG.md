# Repair Changelog — 2026-07-30

## Files changed (main)

| File | Change |
|------|--------|
| `src/lib/supabase/server.ts` | `hasSupabaseConfig` includes plain PG; cookie JWT for createClient |
| `src/lib/db/supabase-compat.ts` | Session memory + cookie token resolve; working `updateUser` / `getSession` |
| `src/lib/db/session-cookies.ts` | **New** — access/refresh cookie helpers |
| `src/app/auth/actions.ts` | Persist/clear plain-PG cookies on sign-in/out |
| `src/middleware.ts` | Consolidated console routing + security headers + plain-PG auth gate |
| `middleware.ts` | **Deleted** (was shadowed / conflicting) |
| `src/lib/platform/maintenance-edge.ts` | SITE_URL fallback, env override, bypass `/rest` `/storage` |
| `src/app/api/account/password/route.ts` | **New** — password change API |
| `src/components/vendor/agent-profile-view.tsx` | Password via API |
| `src/components/admin/admin-profile-view.tsx` | Password via API |
| `src/lib/supabase/client.ts` | Clearer plain-PG env requirements |
| `src/lib/db/rest-auth.ts` | **New** — REST/RPC API key gate |
| `src/app/rest/v1/[table]/route.ts` | Auth on all methods |
| `src/app/rest/v1/rpc/[fn]/route.ts` | Auth |
| `src/app/sitemap.ts` | Drop service-role-only gate |
| `src/lib/notifications/sms.ts` | Dedupe order payment/fulfilment SMS |
| `src/lib/payments/customer-order-paystack.ts` | Amount validation + timeout |
| `src/lib/payments/wallet.ts` | Amount validation + timeout on verify |
| `src/lib/payments/setup-fee.ts` | Amount validation + timeout |
| `src/app/api/webhooks/paystack/route.ts` | Amount checks for setup/wallet |
| `src/app/api/payments/initialize/route.ts` | Paystack init timeout |
| `src/lib/http/fetch-with-timeout.ts` | **New** |
| `src/lib/data/admin-queries.ts` | Bound order stats |
| `src/lib/admin/order-fulfilment.ts` | Limit reconcile batches |
| `.env.example` | Plain-PG + payment reality documented |
| Audit docs | `FULL_SYSTEM_AUDIT.md`, migration reports, payment/performance/changelog |

## Packages

- None added/removed (still dual-mode with `@supabase/*` + `pg`).

## Manual actions required

1. Coolify env: `DATABASE_URL`, `AUTH_JWT_SECRET`, strong `SUPABASE_SERVICE_ROLE_KEY` / `REST_V1_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL=<staging origin>`, Paystack, Arkesel.
2. Paystack dashboard webhook → `https://<host>/api/webhooks/paystack`.
3. Redeploy `dcs-dataselling-staging` after push.
4. Smoke-test: login, admin, vendor wallet, checkout Paystack sandbox, MoMo SMS forwarder.
5. Do **not** expect Moolre/Hubtel — not in product.

## Migrations

- No new SQL migrations in this pass (schema already on staging). Index recommendations are optional/non-destructive.
