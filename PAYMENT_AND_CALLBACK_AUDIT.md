# Payment & Callback Audit

## Gateways in this codebase

| Gateway | Status |
|---------|--------|
| Paystack | Implemented |
| MoMo Direct / ClaimIt | Implemented (SMS forwarder + manual claim) |
| Wallet debit | Implemented (wholesale / API) |
| **Moolre** | **Not implemented** (enum/type legacy only) |
| **Hubtel** | **Not present** |

---

## Paystack

| Step | Route / function | Status |
|------|------------------|--------|
| Initiate (customer) | `POST /api/payments/initialize` | OK — server amount from bundle price; 15s timeout |
| Initiate (wallet) | `POST /api/vendor/wallet/topup` | OK |
| Initiate (setup fee) | `POST /api/vendor/setup-fee/initialize` | OK |
| Redirect | Paystack → `/orders/[id]?ref=` or wallet/create-store callbacks | OK |
| Webhook | `POST /api/webhooks/paystack` | HMAC SHA512; amount checks for setup + wallet + customer finalize |
| Verify fallback | `verifyCustomerOrderWithPaystack`, wallet + setup verify | OK + amount check |
| Duplicate protection | Status guard on order/top-up/setup rows | OK |
| Amount validation | Pesewas vs DB expected (±1) | Fixed 2026-07-30 |

### Status mapping (internal)

Paystack `success` → mark paid / credit wallet. Other statuses ignored on webhook (only `charge.success` handled).

---

## MoMo Direct / ClaimIt

| Step | Route | Status |
|------|-------|--------|
| Initiate | `initialize` with `provider=momo_direct` | Returns merchant numbers + reference |
| Inbound SMS | `POST /api/webhooks/momo-sms` | Secret from platform_settings; unique txn id |
| Manual confirm | `POST /api/payments/momo-direct/confirm` | Customer txn ID |
| Wallet ClaimIt | `/api/vendor/wallet/momo/*` | Generate + claim |
| Admin match/reject | `/api/admin/momo-sms/[id]/*` | OK |

Browser redirect alone never marks paid.

---

## Callback routes test status

| Route | Auth | Signature / secret | Manual live test |
|-------|------|--------------------|------------------|
| `/api/webhooks/paystack` | Public + HMAC | Yes | Pending sandbox |
| `/api/webhooks/momo-sms` | Forwarder secret | Yes | Pending |
| `/api/webhooks/skanka5` | HMAC / diagnostic flag | Yes | Supplier-specific |
| `/api/webhooks/successbizhub` | Supplier webhook | Yes | Supplier-specific |

---

## Reconciliation

- `GET /api/cron/reconcile-wallet-topups` — Paystack verify pending top-ups (`CRON_SECRET`).
- Admin orders page runs bounded `reconcileAutoFulfilledOrders` (limit 200).
