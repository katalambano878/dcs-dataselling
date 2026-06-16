"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Package, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminEmptyState, AdminList, AdminListItem } from "@/components/admin";
import { formatDataAmount, formatGHS, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEARCH_HISTORY_KEY = "dcs-vendor-order-search-history";
const MAX_HISTORY = 8;

export type VendorWholesaleOrderRow = {
  id: string;
  reference: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  source: string;
  createdAt: string;
  items: {
    id: string;
    phone: string;
    bundleName: string;
    dataMb: number;
    quantity: number;
    status: string;
  }[];
};

export type VendorCustomerOrderRow = {
  id: string;
  reference: string;
  recipient_phone: string;
  amount: number;
  status: string;
  created_at: string;
};

type KindFilter = "all" | "wholesale" | "customer";
type StatusFilter = "all" | string;

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "danger" | "neutral"> = {
  pending: "warning",
  paid: "default",
  queued: "default",
  processing: "default",
  fulfilled: "success",
  failed: "danger",
  cancelled: "neutral",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(term: string) {
  const trimmed = term.trim();
  if (!trimmed) return;
  const prev = loadHistory().filter((t) => t.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...prev].slice(0, MAX_HISTORY);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
}

function matchesQuery(q: string, ...fields: (string | number | undefined)[]) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(needle));
}

interface Props {
  wholesaleOrders: VendorWholesaleOrderRow[];
  customerOrders: VendorCustomerOrderRow[];
}

export function VendorOrdersBoard({ wholesaleOrders, customerOrders }: Props) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const runSearch = useCallback(() => {
    if (query.trim()) {
      saveHistory(query.trim());
      setHistory(loadHistory());
    }
  }, [query]);

  const filteredWholesale = useMemo(() => {
    return wholesaleOrders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      return matchesQuery(
        query,
        o.reference,
        ...o.items.map((i) => i.phone),
        ...o.items.map((i) => i.bundleName),
      );
    });
  }, [wholesaleOrders, query, status]);

  const filteredCustomer = useMemo(() => {
    return customerOrders.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      return matchesQuery(query, o.reference, o.recipient_phone);
    });
  }, [customerOrders, query, status]);

  const showWholesale = kind === "all" || kind === "wholesale";
  const showCustomer = kind === "all" || kind === "customer";
  const totalVisible =
    (showWholesale ? filteredWholesale.length : 0) +
    (showCustomer ? filteredCustomer.length : 0);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of wholesaleOrders) set.add(o.status);
    for (const o of customerOrders) set.add(o.status);
    return [...set].sort();
  }, [wholesaleOrders, customerOrders]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-xs font-medium text-muted">
            Search order or phone
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Order ref or phone number…"
                className="flex h-10 w-full rounded-lg border border-slate-200 pl-9 pr-9 text-sm"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </label>
          <Button type="button" className="susu-btn-gold shrink-0" onClick={runSearch}>
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["all", "wholesale", "customer"] as KindFilter[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold capitalize transition",
                kind === k
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {k === "all" ? "All orders" : k}
            </button>
          ))}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="h-7 rounded-full border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
          >
            <option value="all">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {history.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <History className="h-3 w-3" />
              Recent searches
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {history.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    saveHistory(term);
                  }}
                  className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {totalVisible === 0 ? (
        <AdminEmptyState
          icon={Package}
          title="No matching orders"
          description="Try a different search term, phone number, or filter."
        />
      ) : (
        <>
          {showWholesale && filteredWholesale.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-bold text-slate-800">Wholesale orders</h3>
              <AdminList>
                {filteredWholesale.map((order) => (
                  <AdminListItem key={order.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
                      <div>
                        <p className="font-semibold">{order.reference}</p>
                        <p className="text-xs text-muted">
                          {formatDateTime(order.createdAt)} · {order.itemCount} line
                          {order.itemCount === 1 ? "" : "s"} · {order.source}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={STATUS_VARIANT[order.status] ?? "neutral"}>
                          {order.status}
                        </Badge>
                        <p className="num font-bold">{formatGHS(order.totalAmount)}</p>
                      </div>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {order.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-center justify-between gap-2 text-sm"
                        >
                          <span>
                            {formatPhone(item.phone)} · {item.bundleName}{" "}
                            <span className="text-muted">({formatDataAmount(item.dataMb)})</span>
                            {item.quantity > 1 && (
                              <span className="text-muted"> × {item.quantity}</span>
                            )}
                          </span>
                          <span className="text-xs text-muted">{item.status}</span>
                        </li>
                      ))}
                    </ul>
                  </AdminListItem>
                ))}
              </AdminList>
            </section>
          )}

          {showCustomer && filteredCustomer.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-bold text-slate-800">Customer orders</h3>
              <AdminList>
                {filteredCustomer.map((o) => (
                  <AdminListItem key={o.id}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{o.reference}</p>
                        <p className="text-xs text-muted">
                          {formatPhone(o.recipient_phone)} · {formatDateTime(o.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={STATUS_VARIANT[o.status] ?? "neutral"}>{o.status}</Badge>
                        <span className="num text-sm font-bold">{formatGHS(Number(o.amount))}</span>
                      </div>
                    </div>
                  </AdminListItem>
                ))}
              </AdminList>
            </section>
          )}
        </>
      )}
    </div>
  );
}
