"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { Bundle } from "@/types";
import type { NetworkId } from "@/lib/constants";
import { StorefrontBundleCard } from "./storefront-bundle-card";
import { cn } from "@/lib/utils";

interface Props {
  bundles: Bundle[];
}

type FilterId = "all" | NetworkId;

const NETWORK_LABELS: Record<NetworkId, string> = {
  mtn: "MTN",
  telecel: "Telecel",
  at: "AirtelTigo",
};

const NETWORK_DOT: Record<NetworkId, string> = {
  mtn: "bg-amber-400",
  telecel: "bg-rose-500",
  at: "bg-sky-600",
};

export function StorefrontBundles({ bundles }: Props) {
  const [filter, setFilter] = useState<FilterId>("all");

  const networks = useMemo(() => {
    const set = new Set<NetworkId>();
    for (const b of bundles) set.add(b.network);
    return Array.from(set);
  }, [bundles]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bundles.length };
    for (const b of bundles) c[b.network] = (c[b.network] ?? 0) + 1;
    return c;
  }, [bundles]);

  const filtered = useMemo(
    () => (filter === "all" ? bundles : bundles.filter((b) => b.network === filter)),
    [bundles, filter],
  );

  if (bundles.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-3xl shadow-inner">
          📭
        </div>
        <p className="mt-4 text-lg font-bold text-slate-900">
          No bundles listed yet
        </p>
        <p className="mt-1 text-sm text-slate-500">
          This store hasn&apos;t published any data bundles. Check back soon —
          stock arrives daily.
        </p>
      </div>
    );
  }

  const filters: FilterId[] = ["all", ...networks];

  return (
    <div className="space-y-5">
      {/* Network filter rail */}
      {networks.length > 1 && (
        <div className="-mx-1 flex flex-wrap items-center gap-1.5 overflow-x-auto px-1 pb-1">
          {filters.map((id) => {
            const active = filter === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold transition-all",
                  active
                    ? "border-slate-900 bg-slate-900 text-white shadow-md shadow-slate-900/20"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900",
                )}
              >
                {id !== "all" && (
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      NETWORK_DOT[id as NetworkId],
                    )}
                  />
                )}
                {id === "all" ? "All bundles" : NETWORK_LABELS[id as NetworkId]}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0 text-[10px] font-black",
                    active ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500",
                  )}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {counts[id] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
            <Search className="h-5 w-5 text-slate-400" />
          </div>
          <p className="mt-3 font-semibold text-slate-900">
            No bundles on this network
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Try another network or come back later.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-3">
          {filtered.map((b) => (
            <StorefrontBundleCard key={b.id} bundle={b} />
          ))}
        </div>
      )}
    </div>
  );
}
