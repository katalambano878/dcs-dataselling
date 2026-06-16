"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Search, Wallet } from "lucide-react";
import {
  AdminEmptyState,
  AdminList,
  AdminListItem,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
  AdminStatGrid,
  AdminStatTile,
} from "@/components/admin";
import type { VendorWalletMetrics, WalletLedgerRow } from "@/lib/data/vendor-agent";
import { formatGHS } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  metrics: VendorWalletMetrics;
  ledger: WalletLedgerRow[];
  /** When true, skip outer page wrapper (used inside wallet page with ClaimIt above). */
  embedded?: boolean;
}

const ENTRY_LABEL: Record<string, string> = {
  topup: "Top-up",
  order_debit: "Order debit",
  refund: "Refund",
  adjustment: "Adjustment",
};

export function AgentWalletView({ metrics, ledger, embedded = false }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return ledger.filter((e) => {
      if (typeFilter !== "all" && e.entryType !== typeFilter) return false;
      if (search && !(e.reference ?? "").toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [ledger, search, typeFilter]);

  const content = (
    <>
      {!embedded ? (
        <AdminPageIntro
          badge="Wallet & ledger"
          description="Top-ups, wholesale debits, and sales — your full transaction history."
          meta={`${ledger.length} transactions · ${formatGHS(metrics.balance)} available`}
          actions={
            <a href="/api/vendor/wallet/export" className="susu-btn-ghost text-xs">
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </a>
          }
        />
      ) : null}

      <AdminStatGrid className="lg:grid-cols-3">
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="gold"
          label="Wallet balance"
          value={formatGHS(metrics.balance)}
          valueAccent="gold"
        />
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="emerald"
          label="Top-ups today"
          value={formatGHS(metrics.topupsToday)}
          valueAccent="emerald"
        />
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="sky"
          label="Profit today"
          value={formatGHS(metrics.profitToday)}
        />
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="violet"
          label="Lifetime profit"
          value={formatGHS(metrics.lifetimeProfit)}
        />
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="amber"
          label="Sales today"
          value={formatGHS(metrics.salesToday)}
        />
        <AdminStatTile
          icon={<Wallet className="h-4 w-4" />}
          tone="slate"
          label="Lifetime sales"
          value={formatGHS(metrics.lifetimeSales)}
        />
      </AdminStatGrid>

      <AdminSection title="Transaction history" description="Filter by type or search by reference." icon={Wallet}>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Search transaction code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-white py-2 pl-8 pr-3 text-sm focus:border-amber-400/50 focus:outline-none focus:ring-2 focus:ring-amber-400/15"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm focus:outline-none"
          >
            <option value="all">All types</option>
            <option value="topup">Top-up</option>
            <option value="order_debit">Order debit</option>
            <option value="refund">Refund</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <AdminEmptyState
            icon={Wallet}
            title="No transactions match"
            description="Try a different filter or search term."
          />
        ) : (
          <AdminList>
            {filtered.map((e) => (
              <AdminListItem key={e.id}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize text-foreground">
                      {ENTRY_LABEL[e.entryType] ?? e.entryType.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted">
                      {e.reference ?? "—"} · {new Date(e.createdAt).toLocaleString()}
                    </p>
                    {e.note && <p className="text-[10px] text-muted">{e.note}</p>}
                  </div>
                  <p
                    className={cn(
                      "num shrink-0 text-sm font-bold",
                      e.amount >= 0 ? "text-emerald-700" : "text-rose-700",
                    )}
                  >
                    {e.amount >= 0 ? "+" : ""}
                    {formatGHS(e.amount)}
                  </p>
                </div>
              </AdminListItem>
            ))}
          </AdminList>
        )}

        <p className="mt-3 text-center text-[11px] text-muted">
          Need more balance?{" "}
          <Link
            href="/vendor/dashboard/wallet?tab=paystack"
            className="font-semibold text-cyan-700 hover:underline"
          >
            Paystack
          </Link>
          {" · "}
          <Link href="/vendor/dashboard/claim" className="font-semibold text-amber-800 hover:underline">
            ClaimIt
          </Link>
        </p>
      </AdminSection>
    </>
  );

  if (embedded) return content;
  return <AdminPageRoot>{content}</AdminPageRoot>;
}
