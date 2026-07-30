# Supabase → Plain Postgres Migration Guide (DCS ELITE)

## Mode detection

```ts
// src/lib/db/mode.ts
isPlainPostgres() === !!(process.env.DATABASE_URL || process.env.POSTGRES_URL)
```

When true:

- `createClient()` / `createServiceClient()` → `supabase-compat` over `pg`
- Auth → bcrypt + JWT (`src/lib/db/auth.ts`)
- Storage → local disk
- HTTP shims: `/auth/v1`, `/rest/v1`, `/storage/v1`

## Env mapping

| Supabase | Plain Postgres |
|----------|----------------|
| Hosted Postgres | `DATABASE_URL` |
| JWT secret | `AUTH_JWT_SECRET` |
| Anon/service keys | Still set `NEXT_PUBLIC_SUPABASE_URL` to **app origin** + non-empty keys for browser SDK / REST auth / maintenance fetch |
| Storage buckets | `STORAGE_ROOT`, `STORAGE_PUBLIC_URL`, `STORAGE_SIGNING_SECRET` |
| RLS | Application-layer checks (`requireRole`, vendor/admin API helpers) |

## Feature matrix

| Supabase feature | Replacement | Status |
|------------------|-------------|---------|
| PostgREST queries | `supabase-compat` QueryBuilder | Working |
| Auth (password) | `auth.users` + JWT cookies | Fixed 2026-07-30 |
| Auth (recover/OAuth) | Not ported | Stub / N/A |
| RLS | Server-side authz | App-enforced |
| Storage | Disk + `/storage/v1` | Working |
| Realtime | None | N/A (no live subscriptions in app) |
| Edge functions | Next.js route handlers | Ported |
| RPC | `client.rpc` → SQL functions | Working |

## Cutover checklist

1. Provision `store_*` DB; restore schema from `supabase/migrations/` (+ plain-PG auth schema).
2. Set `DATABASE_URL`, `AUTH_JWT_SECRET`, storage vars.
3. Set `NEXT_PUBLIC_SUPABASE_URL` = public site URL; set anon/service keys for shim auth.
4. Set `NEXT_PUBLIC_SITE_URL`, Paystack, Arkesel, supplier keys.
5. Register Paystack webhook → `/api/webhooks/paystack`.
6. Deploy `staging/plain-postgres`; verify login, checkout, wallet top-up, admin.

## Verification results (2026-07-30)

- Production `next build` succeeded after auth/DB repairs.
- Staging app healthy on Coolify.
- Remaining: rotate weak staging keys; confirm Paystack webhook URL; run live sandbox payment.
