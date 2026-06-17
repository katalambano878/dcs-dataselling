"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { NetworkSupplierId, SupplierRoutingConfig } from "@/lib/platform/config-types";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";
import { cn } from "@/lib/utils";

const NETWORK_SUPPLIER_OPTIONS: Array<{ id: NetworkSupplierId; label: string }> = [
  { id: "manual", label: "Manual" },
  { id: "skanka5", label: "Skanka5" },
  { id: "successbizhub", label: "DataCoreGH" },
  { id: "railwayexternal", label: "Railway API" },
];

const NETWORK_ROWS: Array<{ network: SupplierNetworkSlug; label: string }> = [
  { network: "mtn", label: "MTN" },
  { network: "telecel", label: "Telecel" },
  { network: "at", label: "AirtelTigo" },
];

interface Props {
  routing: SupplierRoutingConfig;
  envDefaults: Record<SupplierNetworkSlug, string>;
  effective: Record<SupplierNetworkSlug, string>;
  skanka5Configured: boolean;
  sbhConfigured: boolean;
}

export function SupplierRoutingControls({
  routing,
  envDefaults,
  effective,
  skanka5Configured,
  sbhConfigured,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<SupplierNetworkSlug | null>(null);

  async function setNetworkSupplier(network: SupplierNetworkSlug, supplier: NetworkSupplierId) {
    const current = (routing[network] ?? envDefaults[network]) as NetworkSupplierId;
    if (supplier === current && routing[network] === supplier) return;

    if (supplier === "skanka5" && !skanka5Configured) {
      toast.error("Set SKANKA5_API_KEY and network IDs first");
      return;
    }
    if (supplier === "successbizhub" && !sbhConfigured) {
      toast.error("Set SUCCESSBIZHUB_API_KEY and offer slugs first");
      return;
    }

    setPending(network);
    try {
      const res = await fetch("/api/admin/supplier/routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, supplier }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update routing");
      const label = NETWORK_SUPPLIER_OPTIONS.find((o) => o.id === supplier)?.label ?? supplier;
      toast.success(`${NETWORK_ROWS.find((r) => r.network === network)?.label} → ${label}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update routing");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="admin-supplier-routing mt-3 space-y-3 rounded-xl border border-border p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Admin routing control
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Every network has the same three choices: <strong>Manual</strong>, <strong>Skanka5</strong>, or{" "}
          <strong>Success Biz Hub</strong>. No redeploy needed. If you have not picked one here, the{" "}
          <code>SUPPLIER_FOR_*</code> env default applies.
        </p>
      </div>

      {NETWORK_ROWS.map(({ network, label }) => {
        const active = effective[network] as NetworkSupplierId;
        const isPending = pending === network;
        const adminSet = routing[network] != null;

        return (
          <div
            key={network}
            className="rounded-lg border border-border/80 bg-slate-50/40 px-3 py-2.5"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className={cn("admin-network-badge", `is-${network}`)}>{label}</span>
              <span className="text-[11px] text-muted-foreground">
                {adminSet ? "source: admin" : `env: ${envDefaults[network] || "manual"}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {NETWORK_SUPPLIER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => void setNetworkSupplier(network, opt.id)}
                  className={cn(
                    "admin-routing-chip inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                    active === opt.id && "is-active",
                  )}
                >
                  {isPending && active !== opt.id ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : null}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
