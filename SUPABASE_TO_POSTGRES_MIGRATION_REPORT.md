# Supabase → Postgres Migration Report

## Previously used Supabase features

- Hosted Postgres + PostgREST
- Supabase Auth (password sessions, SSR cookies)
- Service-role bypass of RLS
- Storage (avatars)
- SQL migrations under `supabase/migrations/`
- Optional Realtime — not used in product UI

## PostgreSQL replacements

| Area | Replacement |
|------|-------------|
| Queries | `src/lib/db/supabase-compat.ts` + `pool.ts` |
| Auth | `src/lib/db/auth.ts` + session cookies |
| Config gate | `hasSupabaseConfig()` includes `isPlainPostgres()` |
| Storage | `src/lib/db/storage.ts` |
| HTTP compatibility | `/rest/v1`, `/auth/v1`, `/storage/v1` |

## Remaining Supabase references

- Packages `@supabase/ssr`, `@supabase/supabase-js` retained for dual-mode + browser client.
- Folder name `supabase/migrations` is the schema source of truth.
- Env var names kept for cutover compatibility (`NEXT_PUBLIC_SUPABASE_*`).

## Schema / auth / storage / RLS

- Schema: apply numbered SQL in `supabase/migrations/` to plain Postgres (plus `auth` schema for users).
- Auth: cookie JWT; no Supabase-hosted GoTrue.
- Storage: local disk; avatar APIs use service client storage shim.
- RLS: not used; every API must call session/role helpers.

## Data integrity

- Payment finalize uses status guards (`pending` / `awaiting_momo`) for idempotency.
- Paystack amount must match order/top-up/setup-fee expected GHS (pesewas ±1).
- MoMo SMS `transaction_id` unique index prevents duplicate forwards.
