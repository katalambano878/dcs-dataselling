"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Copy, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

type Lang = "curl" | "node" | "python";

interface Endpoint {
  id: string;
  method: "GET" | "POST";
  path: string;
  title: string;
  description: string;
  request?: {
    body?: object;
    note?: string;
  };
  response: object;
}

const ENDPOINTS: Endpoint[] = [
  {
    id: "ping",
    method: "GET",
    path: "/api/v1/ping",
    title: "Health check",
    description: "Verify your API key is valid and the API is reachable.",
    response: {
      ok: true,
      vendor: { id: "uuid", name: "Your Store", slug: "your-store" },
      server_time: "2026-05-21T12:00:00.000Z",
    },
  },
  {
    id: "account",
    method: "GET",
    path: "/api/v1/account",
    title: "Account & wallet",
    description: "Get vendor info, wallet balance, and webhook configuration.",
    response: {
      vendor: {
        id: "uuid",
        name: "Your Store",
        slug: "your-store",
        verified: true,
        status: "active",
        member_since: "2025-11-01T00:00:00Z",
      },
      wallet: { currency: "GHS", balance: 1250.5, pending_balance: 0 },
      webhook: { configured: true, enabled: true },
    },
  },
  {
    id: "bundles",
    method: "GET",
    path: "/api/v1/bundles",
    title: "List bundles",
    description: "Returns every active SKU you can sell, with wholesale & retail prices.",
    response: {
      currency: "GHS",
      bundles: [
        {
          id: "uuid",
          sku: "MTN-1GB",
          network: "mtn",
          name: "MTN 1GB",
          data_mb: 1024,
          validity_days: 30,
          price: 5.5,
          suggested_retail: 7,
          product_line: "voucher",
          popular: true,
        },
      ],
    },
  },
  {
    id: "networks",
    method: "GET",
    path: "/api/v1/networks",
    title: "List networks",
    description: "Supported telco networks for ordering.",
    response: {
      networks: [
        { id: "mtn", name: "MTN" },
        { id: "telecel", name: "Telecel" },
        { id: "at", name: "AirtelTigo" },
      ],
    },
  },
  {
    id: "order-single",
    method: "POST",
    path: "/api/v1/orders",
    title: "Place a single order",
    description:
      "Charges your wallet and queues a delivery to the recipient. Returns 202 Accepted; track progress via webhook or by polling the order endpoint.",
    request: {
      body: {
        sku: "MTN-1GB",
        recipient_phone: "0241234567",
        quantity: 1,
        reference: "my-order-001",
      },
      note: "Provide either `sku` or `bundle_id`. `reference` makes the call idempotent.",
    },
    response: {
      order: {
        id: "uuid",
        reference: "my-order-001",
        status: "queued",
        bundle: { sku: "MTN-1GB", name: "MTN 1GB", network: "mtn", data_mb: 1024 },
        recipient_phone: "0241234567",
        quantity: 1,
        unit_price: 5.5,
        total: 5.5,
        wallet_balance_after: 1245,
      },
    },
  },
  {
    id: "order-bulk",
    method: "POST",
    path: "/api/v1/orders/bulk",
    title: "Place a bulk order",
    description:
      "Submit up to 500 line items at once. Use `dry_run: true` for a price preview without charging.",
    request: {
      body: {
        items: [
          { sku: "MTN-1GB", recipient_phone: "0241234567", quantity: 1 },
          { sku: "TELECEL-2GB", recipient_phone: "0501112222", quantity: 2 },
        ],
        dry_run: false,
        reference: "campaign-abc",
      },
    },
    response: {
      order: {
        id: "uuid",
        reference: "campaign-abc",
        status: "queued",
        item_count: 3,
        line_count: 2,
        total: 23.5,
        wallet_balance_after: 1221.5,
        invalid_lines: [],
      },
    },
  },
  {
    id: "order-get",
    method: "GET",
    path: "/api/v1/orders/{reference}",
    title: "Get order by reference",
    description: "Check the status of a single order and per-recipient line items.",
    response: {
      order: {
        id: "uuid",
        reference: "my-order-001",
        status: "fulfilled",
        supplier: "skanka5",
        supplier_status: "processed",
        total: 5.5,
        fulfilled_at: "2026-05-21T12:05:30Z",
        items: [
          {
            id: "uuid",
            recipient_phone: "0241234567",
            quantity: 1,
            unit_price: 5.5,
            line_total: 5.5,
            status: "fulfilled",
            fulfilled_at: "2026-05-21T12:05:28Z",
            bundle: { sku: "MTN-1GB", name: "MTN 1GB", network: "mtn", data_mb: 1024 },
          },
        ],
      },
    },
  },
  {
    id: "order-status",
    method: "POST",
    path: "/api/v1/orders/{reference}/status",
    title: "Update order status (old site)",
    description:
      "Push delivered/failed from your old shop so DCS Elite matches. Use the same order reference from POST /orders.",
    request: {
      body: {
        status: "fulfilled",
        note: "optional",
      },
    },
    response: {
      ok: true,
      reference: "my-order-001",
      status: "fulfilled",
      already: false,
    },
  },
  {
    id: "order-list",
    method: "GET",
    path: "/api/v1/orders?limit=25&status=fulfilled",
    title: "List recent orders",
    description: "Paginated list, newest first. Optional `status` filter.",
    response: {
      orders: [
        {
          id: "uuid",
          reference: "my-order-001",
          status: "fulfilled",
          supplier_status: "processed",
          total: 5.5,
          item_count: 1,
          source: "single",
          created_at: "2026-05-21T12:00:00Z",
        },
      ],
      count: 1,
    },
  },
];

export function DocsBrowser({ apiBase }: { apiBase: string }) {
  const [selectedId, setSelectedId] = useState(ENDPOINTS[0].id);
  const [lang, setLang] = useState<Lang>("curl");
  const endpoint = ENDPOINTS.find((e) => e.id === selectedId)!;

  const exampleCode = useMemo(
    () => buildExample(lang, endpoint, apiBase),
    [lang, endpoint, apiBase],
  );

  return (
    <div className="grid gap-3 lg:grid-cols-[260px_1fr]">
      {/* Side nav */}
      <nav className="panel max-h-[72vh] overflow-y-auto p-2">
        <p className="eyebrow-section px-2 pb-2 pt-1">Endpoints</p>
        <ul className="space-y-0.5">
          {ENDPOINTS.map((e) => {
            const active = e.id === selectedId;
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(e.id)}
                  className={cn(
                    "group flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition",
                    active
                      ? "bg-amber-500/15 text-white"
                      : "text-muted hover:bg-white/5 hover:text-white",
                  )}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5">
                      <span
                        className={cn("chip", e.method === "GET" ? "chip-sky" : "chip-emerald")}
                      >
                        {e.method}
                      </span>
                      <span className="truncate font-semibold">{e.title}</span>
                    </p>
                    <code className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                      {e.path}
                    </code>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-3 w-3 shrink-0 transition",
                      active ? "text-amber-600" : "text-muted-soft",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <p className="eyebrow-section px-2 pb-1 pt-3">References</p>
        <ul className="space-y-1 px-2 text-[11px]">
          <li className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="font-semibold text-foreground">Auth</p>
            <code className="mt-0.5 block font-mono text-[10px] text-muted">
              Authorization: Bearer dcs_…
            </code>
          </li>
          <li className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="font-semibold text-foreground">Base URL</p>
            <code className="mt-0.5 block break-all font-mono text-[10px] text-muted">
              {apiBase}
            </code>
          </li>
          <li className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="font-semibold text-foreground">Currency</p>
            <span className="text-muted">GHS (Ghanaian Cedi)</span>
          </li>
        </ul>
      </nav>

      {/* Detail */}
      <div className="space-y-3">
        <div className="panel p-5">
          <div className="flex items-center gap-2">
            <span className={cn("chip", endpoint.method === "GET" ? "chip-sky" : "chip-emerald")}>
              {endpoint.method}
            </span>
            <code className="font-mono text-sm text-foreground">{endpoint.path}</code>
          </div>
          <h3 className="mt-2 text-lg font-bold text-foreground">{endpoint.title}</h3>
          <p className="mt-1 text-sm text-muted">{endpoint.description}</p>
        </div>

        {/* Code sample */}
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-amber-600" />
              <p className="eyebrow-light">Request</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-border bg-white/5 p-0.5">
              {(["curl", "node", "python"] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn(
                    "rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition",
                    lang === l
                      ? "bg-amber-500 text-[#061528]"
                      : "text-muted hover:text-white",
                  )}
                >
                  {langLabel(l)}
                </button>
              ))}
            </div>
          </div>
          <CodeBlock code={exampleCode} />
        </div>

        {endpoint.request?.note && (
          <div
            className="rounded-2xl border p-3 text-xs"
            style={{
              background:
                "linear-gradient(135deg, #fff8e1 0%, #fffaf0 60%, #ffffff 100%)",
              borderColor: "rgba(212, 175, 55, 0.35)",
              color: "#7c5400",
            }}
          >
            {endpoint.request.note}
          </div>
        )}

        {/* Response */}
        <div className="panel overflow-hidden">
          <div className="border-b border-border px-4 py-2.5">
            <p className="eyebrow-light">Response</p>
          </div>
          <CodeBlock code={JSON.stringify(endpoint.response, null, 2)} language="json" />
        </div>

        {/* Common errors */}
        <div className="panel p-5">
          <p className="eyebrow-light">Common error codes</p>
          <ul className="mt-3 space-y-2 text-xs">
            <ErrorRow status={401} code="missing_key | invalid_key | revoked | expired" desc="API key is missing, malformed, or no longer valid." />
            <ErrorRow status={402} code="insufficient_funds" desc="Wallet balance is below the order total. Top up to retry." />
            <ErrorRow status={404} code="bundle_not_found | not_found" desc="The SKU or reference does not exist or is inactive." />
            <ErrorRow status={400} code="invalid_phone | invalid_body" desc="Recipient phone or request payload did not validate." />
            <ErrorRow status={500} code="internal_error" desc="Unexpected server error. Safe to retry with the same reference." />
          </ul>
        </div>
      </div>
    </div>
  );
}

function langLabel(l: Lang): string {
  return l === "node" ? "Node.js" : l === "python" ? "Python" : "cURL";
}

function ErrorRow({ status, code, desc }: { status: number; code: string; desc: string }) {
  return (
    <li className="flex flex-wrap items-start gap-2">
      <span className="chip chip-rose">{status}</span>
      <code className="font-mono text-[11px] text-foreground">{code}</code>
      <span className="text-[11px] text-muted">— {desc}</span>
    </li>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="code-vault overflow-x-auto rounded-none border-0 p-4">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-white/15 bg-slate-900/85 px-2 py-1 text-[10px] font-bold text-white/85 backdrop-blur hover:text-white"
        aria-label={`Copy ${language ?? "code"}`}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function buildExample(lang: Lang, endpoint: Endpoint, apiBase: string): string {
  const fullUrl = `${apiBase}${endpoint.path}`;
  const hasBody = endpoint.method === "POST" && endpoint.request?.body;
  const body = endpoint.request?.body;

  if (lang === "curl") {
    const lines = [`curl -X ${endpoint.method} "${fullUrl}" \\`];
    lines.push(`  -H "Authorization: Bearer YOUR_API_KEY" \\`);
    if (hasBody) {
      lines.push(`  -H "Content-Type: application/json" \\`);
      const jsonStr = JSON.stringify(body, null, 2)
        .split("\n")
        .map((line, i) => (i === 0 ? `  -d '${line}` : `     ${line}`))
        .join("\n");
      lines.push(`${jsonStr}'`);
    } else {
      // Remove trailing backslash from last line
      lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
    }
    return lines.join("\n");
  }

  if (lang === "node") {
    return `const res = await fetch("${fullUrl}", {
  method: "${endpoint.method}",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",${hasBody ? `\n    "Content-Type": "application/json",` : ""}
  },${
    hasBody
      ? `\n  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}),`
      : ""
  }
});
const data = await res.json();
console.log(data);`;
  }

  // Python
  return `import requests

${
  hasBody
    ? `payload = ${JSON.stringify(body, null, 4)}

res = requests.${endpoint.method.toLowerCase()}(
    "${fullUrl}",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json=payload,
)`
    : `res = requests.${endpoint.method.toLowerCase()}(
    "${fullUrl}",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
)`
}
print(res.json())`;
}
