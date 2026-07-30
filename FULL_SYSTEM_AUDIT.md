# Full System Audit — DCS ELITE (`dcs-dataselling`)

**Branch:** `staging/plain-postgres`  
**Date:** 2026-07-30  
**Staging:** https://dcs-dataselling-staging.169-58-8-203.sslip.io (Coolify, healthy)

---

## Baseline (before repairs)

| Check | Result |
|-------|--------|
| Git | Clean, on `staging/plain-postgres` @ `4ce6cc1` |
| Local `.env` / `.env.local` | Missing |
| Dependencies | Present after `npm install` |
| Architecture | Hybrid: `@supabase/*` packages + `pg` pool + `supabase-compat` QueryBuilder |
| Mode switch | `DATABASE_URL` / `POSTGRES_URL` → plain Postgres |
| Production build (pre-fix) | Not re-run locally before fixes |
| Staging HTTP | `/` 200, `/auth/login` 200, `/api/v1/ping` 401 (auth required) |

### Critical baseline defects

1. `hasSupabaseConfig()` ignored `DATABASE_URL` → ~130 call sites returned empty/503 in plain-PG.
2. Compat `auth.getUser()` required an explicit JWT and never read cookies → login/session broken.
3. Sign-in never persisted cookies in plain-PG mode.
4. Dual middleware files (`middleware.ts` + `src/middleware.ts`); root admin gate used wrong login path.
5. `/rest/v1/*` exposed Postgres with no auth (no RLS).
6. Admin order stats scanned entire `orders` table (freeze risk).
7. Paystack finalize/verify paths did not compare charged amount to order amount.
8. Order payment/fulfilment SMS lacked dedupe.
9. `.env.example` / README documented Supabase-only setup.

---

## Architecture summary

| Layer | Implementation |
|-------|----------------|
| App | Next.js 16 App Router, React 19, TypeScript |
| DB access | `src/lib/db/pool.ts` (`pg` Pool) + `supabase-compat.ts` PostgREST-shaped API |
| Auth (plain PG) | bcrypt `auth.users` + jose JWT (`src/lib/db/auth.ts`), cookies `sb-access-token` / `sb-refresh-token` |
| Auth (legacy) | Hosted Supabase Auth via `@supabase/ssr` when not in plain-PG mode |
| Storage | Local disk shim (`STORAGE_ROOT`) + `/storage/v1/*` |
| Payments | **Paystack** + **MoMo Direct / ClaimIt** (SMS forwarder). Not Moolre/Hubtel |
| SMS | **Arkesel** outbound. Not Moolre SMS |
| Shims | `/auth/v1`, `/rest/v1`, `/storage/v1` for SDK cutover |

---

## Route inventory (high level)

- **Public pages (17):** `/`, about, trust, terms, privacy, support, status, developers, create-store, api-access, account, checkout, auth/login, orders/[id], vendor/[slug], maintenance, …
- **Vendor dashboard (16):** home, catalogue, storefront, orders, wallet, wholesale, wishlist, profile, rewards, referrals, developer, mtn-afa, claim, complaints, earnings, transactions
- **Admin (15):** overview, orders, vendors, transactions, promotions, settings, analytics, disputes, consoles, wholesale, wishlist, momo-payments, operations, supplier, sms-debugger, agent-ops, profile
- **Console agent (7):** send, credits, transactions, support, api, profile, admin
- **API routes:** ~95 (vendor, admin, v1 developer API, payments, webhooks, cron, console)
- **Shims:** auth/v1, rest/v1, storage/v1

---

## Fixes applied (this pass)

See `REPAIR_CHANGELOG.md`. Highlights:

- DB config gate, cookie sessions, middleware merge, REST auth, Paystack amount checks, SMS dedupe, admin query bounds, fetch timeouts, env docs.

---

## Remaining risks

1. **Moolre / Hubtel** — not implemented; prompt assumed them. Product uses Paystack + MoMo Direct + Arkesel.
2. **Password recovery** — `/auth/v1/recover` is a no-op (no email send).
3. **REST shim** — now key-gated, but key must be strong and not equal to a guessable anon string in production.
4. **Browser Supabase client** — unused after password-change migration; still throws if misused without env.
5. **Supplier fetches** — not all upstream supplier calls have timeouts yet.
6. **Live payment/SMS E2E** — not executed against live credentials in this audit (staging sandbox only).

---

## Final readiness

**Ready after listed manual actions** — see section in chat response / `REPAIR_CHANGELOG.md`.
