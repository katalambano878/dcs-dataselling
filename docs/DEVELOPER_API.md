# DCS ELITE API

This is the reference for the DCS ELITE data API. With it you can pull the
bundle list, place single or bulk orders, check order status, read your wallet
balance, and get webhook callbacks when orders complete. Orders are paid from
your vendor wallet, so keep it topped up.

Base URL: `https://dcselite.com/api/v1`

All paths below are relative to that. So `GET /ping` means
`GET https://dcselite.com/api/v1/ping`. Everything is JSON over HTTPS, and
prices are in GHS.

## Getting a key

If you just want to connect your own app or website and don't need a storefront,
sign up for API access at `https://dcselite.com/api-access`. You won't be charged
the store setup fee. An admin approves the account, and after that your keys work.

Already have a full store? Log in to your dashboard, open the Developer page
(Dashboard > Developer), and create a key. Either way you'll get something like
`dcs_live_xxxxxxxxxxxxxxxxxxxxxxxx`.

The full key is only shown once when you create it, so copy it straight away and
keep it on your server (an env var is fine). If you lose it, just revoke it and
make a new one. Don't put it in front-end code or commit it anywhere public.

Your store setup fee needs to be paid before the key will work.

## Authentication

Pass the key as a Bearer token on every request:

```
Authorization: Bearer dcs_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

Quick check that it works:

```bash
curl https://dcselite.com/api/v1/ping \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "ok": true,
  "vendor": { "id": "uuid", "name": "Your Store", "slug": "your-store" },
  "server_time": "2026-06-08T12:00:00.000Z"
}
```

A 401 back means the key is missing, malformed, revoked, or expired.

## Endpoints at a glance

| Method | Path | What it does |
| ------ | ---- | ------------ |
| GET  | `/ping` | Check the key and that the API is up |
| GET  | `/account` | Vendor info, wallet balance, webhook status |
| GET  | `/networks` | Supported networks |
| GET  | `/bundles` | Bundles you can sell, with your prices |
| POST | `/orders` | Place one order |
| POST | `/orders/bulk` | Place up to 500 at once (preview supported) |
| GET  | `/orders/{reference}` | One order plus its line items |
| GET  | `/orders` | Recent orders, newest first |

### GET /account

```bash
curl https://dcselite.com/api/v1/account \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "vendor": {
    "id": "uuid",
    "name": "Your Store",
    "slug": "your-store",
    "verified": true,
    "status": "active",
    "member_since": "2025-11-01T00:00:00Z"
  },
  "wallet": { "currency": "GHS", "balance": 1250.5, "pending_balance": 0 },
  "webhook": { "configured": true, "enabled": true }
}
```

Orders draw from `wallet.balance`, so top up from the dashboard before ordering.

### GET /networks

```json
{
  "networks": [
    { "id": "mtn", "name": "MTN" },
    { "id": "telecel", "name": "Telecel" },
    { "id": "at", "name": "AirtelTigo" }
  ]
}
```

### GET /bundles

Returns the active SKUs you can sell, with your wholesale price and a suggested
retail price.

```bash
curl https://dcselite.com/api/v1/bundles \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "currency": "GHS",
  "bundles": [
    {
      "id": "uuid",
      "sku": "MTN-1GB",
      "network": "mtn",
      "name": "MTN 1GB",
      "data_mb": 1024,
      "validity_days": 30,
      "price": 5.5,
      "suggested_retail": 7,
      "product_line": "voucher",
      "popular": true
    }
  ]
}
```

When you order, you can reference a bundle by its `sku` or its `id`.

### POST /orders

Charges your wallet and queues delivery. You get back a 202, which means it's
been accepted but not delivered yet. Track it with a webhook or by polling the
order endpoint.

Body:

```json
{
  "sku": "MTN-1GB",
  "recipient_phone": "0241234567",
  "quantity": 1,
  "reference": "my-order-001"
}
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `sku` | one of sku/bundle_id | Bundle SKU, e.g. `MTN-1GB` |
| `bundle_id` | one of sku/bundle_id | Bundle UUID instead of the SKU |
| `recipient_phone` | yes | Ghana number; `024...`, `+233...`, and `233...` all work |
| `quantity` | no | Defaults to 1, max 100 |
| `reference` | no | Your own ID. Send one and the call becomes idempotent, so a retry with the same reference returns the original order instead of charging twice |

Example:

```bash
curl -X POST https://dcselite.com/api/v1/orders \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "MTN-1GB",
    "recipient_phone": "0241234567",
    "quantity": 1,
    "reference": "my-order-001"
  }'
```

Response (202):

```json
{
  "order": {
    "id": "uuid",
    "reference": "my-order-001",
    "status": "queued",
    "bundle": { "id": "uuid", "sku": "MTN-1GB", "name": "MTN 1GB", "network": "mtn", "data_mb": 1024 },
    "recipient_phone": "0241234567",
    "quantity": 1,
    "unit_price": 5.5,
    "total": 5.5,
    "wallet_balance_after": 1245
  }
}
```

### POST /orders/bulk

Up to 500 line items in one call. Your wallet is debited once for the whole
amount, and each line is fulfilled on its own, so one bad line won't hold up the
rest. Also returns a 202.

Set `dry_run: true` if you just want a price/validation preview without being
charged.

Body:

```json
{
  "items": [
    { "sku": "MTN-1GB", "recipient_phone": "0241234567", "quantity": 1 },
    { "sku": "TELECEL-2GB", "recipient_phone": "0501112222", "quantity": 2 }
  ],
  "dry_run": false,
  "reference": "campaign-abc"
}
```

Response (202):

```json
{
  "order": {
    "id": "uuid",
    "reference": "campaign-abc",
    "status": "queued",
    "item_count": 3,
    "line_count": 2,
    "total": 23.5,
    "wallet_balance_after": 1221.5,
    "invalid_lines": []
  }
}
```

With `dry_run: true` you instead get `valid_count`, `invalid_count`, `total`,
`wallet_balance`, `sufficient_funds`, and the resolved `lines` and `errors`, so
you can sanity-check before charging.

### POST /orders/{reference}/status

Call this from your old shop when you mark an API order **delivered** or **failed**
so DCS Elite updates to match (Telecel/MTN wallet orders stay on `processing`
until something closes them).

```bash
curl -X POST https://dcselite.com/api/v1/orders/my-order-001/status \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "fulfilled",
    "note": "optional"
  }'
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `status` | yes | `fulfilled` / `completed` / `delivered`, or `failed` / `undelivered` |
| `note` | no | Stored on the order/lines (max 500 chars) |

Failed updates refund the wallet for failed lines (same as supplier failure).

### GET /orders/{reference}

```bash
curl https://dcselite.com/api/v1/orders/my-order-001 \
  -H "Authorization: Bearer YOUR_API_KEY"
```


```json
{
  "order": {
    "id": "uuid",
    "reference": "my-order-001",
    "status": "fulfilled",
    "supplier_status": "processed",
    "total": 5.5,
    "fulfilled_at": "2026-06-08T12:05:30Z",
    "items": [
      {
        "id": "uuid",
        "recipient_phone": "0241234567",
        "quantity": 1,
        "unit_price": 5.5,
        "line_total": 5.5,
        "status": "fulfilled",
        "fulfilled_at": "2026-06-08T12:05:28Z",
        "bundle": { "sku": "MTN-1GB", "name": "MTN 1GB", "network": "mtn", "data_mb": 1024 }
      }
    ]
  }
}
```

### GET /orders

Query params: `limit` (1 to 100, default 25) and an optional `status` filter
like `queued`, `fulfilled`, or `failed`.

```bash
curl "https://dcselite.com/api/v1/orders?limit=25&status=fulfilled" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

```json
{
  "orders": [
    {
      "id": "uuid",
      "reference": "my-order-001",
      "status": "fulfilled",
      "supplier_status": "processed",
      "total": 5.5,
      "item_count": 1,
      "source": "single",
      "created_at": "2026-06-08T12:00:00Z"
    }
  ],
  "count": 1
}
```

## Order statuses

- `queued`: paid and waiting to go out to the network
- `processing`: handed off to the supplier
- `fulfilled`: data delivered
- `failed`: delivery failed; the wallet is refunded for failed lines

Since delivery is async, don't expect `fulfilled` in the first 202 response.
Either poll `GET /orders/{reference}` or use a webhook.

## Webhooks

Rather than polling, you can register a URL and we'll POST order updates to it as
they happen. Set it up under Developer > Webhooks: enter an HTTPS URL and a
signing secret, then enable it.

Events we send: `order.queued`, `order.processing`, `order.fulfilled`,
`order.failed`.

A delivery looks like this:

```http
POST /your-webhook-endpoint HTTP/1.1
Content-Type: application/json
User-Agent: DCS-Elite-Webhook/1.0
X-DCS-Event: order.fulfilled
X-DCS-Signature: <hmac-sha256-hex>
```

```json
{
  "event": "order.fulfilled",
  "reference": "my-order-001",
  "delivered_at": "2026-06-08T12:05:30.000Z",
  "data": { }
}
```

`X-DCS-Signature` is an HMAC-SHA256 of the raw request body using your webhook
secret. Verify it before trusting anything:

```js
import crypto from "crypto";

function verify(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader),
    Buffer.from(expected),
  );
}
```

Reply with a 2xx quickly (within about 8 seconds). You can see every delivery
and its response in the dashboard if you need to debug.

## Errors

Errors come back with a non-2xx status and a JSON body:

```json
{ "error": "Human readable message", "code": "machine_code" }
```

| HTTP | code | Meaning |
| ---- | ---- | ------- |
| 400 | `invalid_body`, `invalid_phone`, `invalid_json` | Payload or recipient phone didn't validate |
| 401 | `missing_key`, `malformed_key`, `invalid_key`, `revoked`, `expired` | Something's wrong with the key |
| 402 | `insufficient_funds` | Wallet is below the order total; top up and retry |
| 403 | `setup_incomplete` | Store setup fee hasn't been paid |
| 403 | `pending_approval` | API-only account is waiting for admin approval |
| 404 | `bundle_not_found`, `not_found` | SKU/bundle or reference doesn't exist or is inactive |
| 409 | `recipient_cooldown`, `debit_failed` | Recipient ordered too recently, or the wallet debit failed |
| 500 | `internal_error` | Something broke our side; safe to retry with the same reference |
| 503 | `not_configured` | Temporarily unavailable |

## A few things worth doing

Send a `reference` on every order. It's the safety net against double charges if
a request times out and you retry.

Lean on webhooks instead of hammering the API. If you do poll, every 10 to 30
seconds on `GET /orders/{reference}` is plenty.

Keep the wallet funded so you don't hit `insufficient_funds`, and run bulk jobs
with `dry_run` first to catch bad numbers before you pay.

## Node example

```js
const BASE = "https://dcselite.com/api/v1";
const KEY = process.env.DCS_API_KEY;

async function placeOrder() {
  const res = await fetch(`${BASE}/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sku: "MTN-1GB",
      recipient_phone: "0241234567",
      quantity: 1,
      reference: `order-${Date.now()}`,
    }),
  });
  const data = await res.json();
  console.log(res.status, data);
}

placeOrder();
```

There's a live version of these docs with copy-paste examples at
`https://dcselite.com/developers`. If something's not behaving, contact us and
we'll take a look.
