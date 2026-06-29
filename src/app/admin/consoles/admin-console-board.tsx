"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminConsoleVendorRow } from "@/lib/data/admin-console";
import type { ConsolePricingTier } from "@/lib/console/pricing";
import { formatConsoleData, gbToMb } from "@/lib/console/units";
import { cn } from "@/lib/utils";

interface Props {
  vendors: AdminConsoleVendorRow[];
  tiers: ConsolePricingTier[];
  variant?: "default" | "vault";
}

export function AdminConsoleBoard({ vendors: initial, tiers, variant = "default" }: Props) {
  const vault = variant === "vault";
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [allocVendor, setAllocVendor] = useState<string | null>(null);
  const [amountGb, setAmountGb] = useState("100");
  const [note, setNote] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return initial;
    return initial.filter(
      (v) =>
        v.businessName.toLowerCase().includes(needle) ||
        v.slug.toLowerCase().includes(needle),
    );
  }, [initial, q]);

  async function toggleEnabled(vendorId: string, enabled: boolean) {
    setPending(vendorId);
    try {
      const res = await fetch("/api/admin/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", vendor_id: vendorId, enabled }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(enabled ? "Console enabled" : "Console disabled");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function setTier(vendorId: string, tierId: string | null) {
    setPending(`tier-${vendorId}`);
    try {
      const res = await fetch("/api/admin/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_tier", vendor_id: vendorId, tier_id: tierId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Pricing tier updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function allocate() {
    if (!allocVendor) return;
    const gb = Number(amountGb);
    if (!Number.isFinite(gb) || gb <= 0) {
      toast.error("Enter a valid GB amount");
      return;
    }

    setPending(`alloc-${allocVendor}`);
    try {
      const res = await fetch("/api/admin/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "allocate",
          vendor_id: allocVendor,
          amount_gb: gb,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; balance_after_mb?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      toast.success(
        `Allocated ${gb}GB (${formatConsoleData(gbToMb(gb))}) — new balance ${formatConsoleData(data.balance_after_mb ?? 0)}`,
      );
      setAllocVendor(null);
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <AdminSection title="Agent data consoles" icon={Monitor}>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className={cn("min-w-[200px] flex-1 text-sm", vault && "text-slate-200")}>
          Search agents
          <Input
            className={cn(
              "mt-1 h-9",
              vault && "border-white/10 bg-white/5 text-white placeholder:text-white/40",
            )}
            placeholder="Business name or slug…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
      </div>

      {allocVendor && (
        <div
          className={cn(
            "mb-4 rounded-xl border p-4",
            vault
              ? "border-white/10 bg-white/5"
              : "border-blue-200 bg-blue-50",
          )}
        >
          <p
            className={cn(
              "text-sm font-semibold",
              vault ? "text-white" : "text-blue-900",
            )}
          >
            Allocate data credit — {initial.find((v) => v.vendorId === allocVendor)?.businessName}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className={cn("text-sm", vault && "text-slate-200")}>
              Amount (GB)
              <Input
                type="number"
                step="1"
                className={cn(
                  "mt-1 h-9 w-32",
                  vault && "border-white/10 bg-black/20 text-white",
                )}
                value={amountGb}
                onChange={(e) => setAmountGb(e.target.value)}
              />
            </label>
            <label className={cn("min-w-[200px] flex-1 text-sm", vault && "text-slate-200")}>
              Note (optional)
              <Input
                className={cn(
                  "mt-1 h-9",
                  vault && "border-white/10 bg-black/20 text-white placeholder:text-white/40",
                )}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. March iShare pool"
              />
            </label>
            <Button size="sm" disabled={pending != null} onClick={() => void allocate()}>
              Credit console
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setAllocVendor(null)}>
              Cancel
            </Button>
          </div>
          <p className={cn("mt-2 text-xs", vault ? "text-white/55" : "text-blue-800")}>
            1 GB = 1000 MB (decimal).
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <AdminEmptyState icon={Monitor} title="No vendors" description="No agents match this search." />
      ) : (
        <AdminDataTable minWidth="900px">
          <AdminTableHead>
            <AdminTh>Agent</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Console</AdminTh>
            <AdminTh>Balance</AdminTh>
            <AdminTh>Tier</AdminTh>
            <AdminTh>Sends</AdminTh>
            <AdminTh>Actions</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((row) => (
              <tr key={row.vendorId} className="admin-table-tr">
                <td className="admin-table-td">
                  <p className="font-medium">{row.businessName}</p>
                  <p className={cn("text-xs", vault ? "text-white/50" : "text-muted-foreground")}>
                    @{row.slug}
                  </p>
                </td>
                <td className="admin-table-td capitalize">{row.status}</td>
                <td className="admin-table-td">
                  <Badge variant={row.enabled ? "success" : "neutral"}>
                    {row.enabled ? "Active" : "Off"}
                  </Badge>
                </td>
                <td className="admin-table-td font-semibold">{formatConsoleData(row.balanceMb)}</td>
                <td className="admin-table-td">
                  <select
                    className={cn(
                      "h-8 rounded-md border px-2 text-xs",
                      vault
                        ? "border-white/10 bg-white/5 text-white"
                        : "border-input bg-background",
                    )}
                    value={row.pricingTierId ?? ""}
                    disabled={pending === `tier-${row.vendorId}`}
                    onChange={(e) =>
                      void setTier(row.vendorId, e.target.value ? e.target.value : null)
                    }
                  >
                    <option value="">Default</option>
                    {tiers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.priceLabel})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="admin-table-td">{row.totalSends}</td>
                <td className="admin-table-td">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending === row.vendorId}
                      onClick={() => void toggleEnabled(row.vendorId, !row.enabled)}
                    >
                      {row.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending != null}
                      onClick={() => setAllocVendor(row.vendorId)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Allocate
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </AdminSection>
  );
}
