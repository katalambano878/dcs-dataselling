# Performance Report

## Freezing / slowness — root causes found

1. **Full-table admin order stats** — `fetchAdminOrderStats()` selected all orders into memory.
2. **Unbounded fulfilment reconcile** on admin orders load — scanned all queued items/orders.
3. **Broken auth gates** — many routes returned 503 / empty, causing client retries and “stuck” UIs.
4. **External Paystack calls without timeout** — hung requests under slow network.
5. **Maintenance middleware** self-fetch risk without `/rest/` bypass (fixed).

## Fixes

| Area | Change |
|------|--------|
| Admin stats | Last 90 days + `limit 50000` |
| Fulfilment reconcile | `.limit(200)` per query |
| Paystack HTTP | `fetchWithTimeout` 15s |
| Auth/session | Cookie JWT → fewer failed dashboard loads |
| REST open access | Key required (stops accidental heavy scans from internet) |

## Before / after

| Metric | Before | After |
|--------|--------|-------|
| Production build | Unknown / prior Coolify green | Local `next build` success (~7 min incl. types) |
| Admin orders load risk | O(all orders + all stale lines) | Bounded windows |
| Paystack verify hang | Unlimited | 15s abort |

## Recommended infrastructure

- Add SQL aggregate indexes on `orders(created_at)`, `orders(status)`, `wallet_topups(status, created_at)`.
- Move fulfilment reconcile to cron only (already partially on supplier poll cron).
- CDN for public storefront assets; keep admin uncached.
