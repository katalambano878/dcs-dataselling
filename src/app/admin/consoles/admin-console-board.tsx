"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Monitor, Plus } from "lucide-react";
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
import { AdminConsoleApiKeyPanel } from "@/components/admin/admin-console-api-key-panel";
import { cn } from "@/lib/utils";

type PanelMode = "credit" | "debit" | "api_key";

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
  const [panelVendor, setPanelVendor] = useState<string | null>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>("credit");
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

  const panelVendorRow = panelVendor
    ? initial.find((v) => v.vendorId === panelVendor)
    : undefined;

  function openPanel(vendorId: string, mode: PanelMode) {
    setPanelVendor(vendorId);
    setPanelMode(mode);
    setAmountGb(mode === "debit" ? "1" : "100");
    setNote("");
  }

  function closePanel() {
    setPanelVendor(null);
    setNote("");
  }

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

  async function submitPanel() {
    if (!panelVendor) return;
    const gb = Number(amountGb);
    if (!Number.isFinite(gb) || gb <= 0) {
      toast.error("Enter a valid GB amount");
      return;
    }

    if (panelMode === "debit" && panelVendorRow) {
      const needMb = gbToMb(gb);
      if (needMb > panelVendorRow.balanceMb) {
        toast.error(
          `Cannot debit ${formatConsoleData(needMb)} — balance is only ${formatConsoleData(panelVendorRow.balanceMb)}`,
        );
        return;
      }
    }

    setPending(`${panelMode}-${panelVendor}`);
    try {
      const res = await fetch("/api/admin/console", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: panelMode === "debit" ? "debit" : "allocate",
          vendor_id: panelVendor,
          amount_gb: gb,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; balance_after_mb?: number };
      if (!res.ok) throw new Error(data.error ?? "Failed");

      const amountLabel = formatConsoleData(gbToMb(gb));
      const balLabel = formatConsoleData(data.balance_after_mb ?? 0);
      toast.success(
        panelMode === "debit"
          ? `Debited ${amountLabel} — new balance ${balLabel}`
          : `Allocated ${amountLabel} — new balance ${balLabel}`,
      );
      closePanel();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  const isDebit = panelMode === "debit";

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

      {panelVendor && panelVendorRow && panelMode === "api_key" && (
        <AdminConsoleApiKeyPanel
          vendorId={panelVendor}
          agentName={panelVendorRow.businessName}
          onClose={closePanel}
          variant={vault ? "vault" : "default"}
        />
      )}

      {panelVendor && panelVendorRow && panelMode !== "api_key" && (
        <div
          className={cn(
            "admin-console-alloc-panel mb-4 rounded-xl border p-4",
            isDebit ? "border-red-200 bg-red-50" : "border-blue-200 bg-blue-50",
          )}
        >
          <p
            className={cn(
              "text-sm font-semibold",
              isDebit ? "text-red-900" : "text-blue-900",
            )}
          >
            {isDebit ? "Debit console credit" : "Allocate data credit"} —{" "}
            {panelVendorRow?.businessName}
          </p>
          {isDebit && panelVendorRow && (
            <p className="mt-1 text-xs text-red-800">
              Current balance: {formatConsoleData(panelVendorRow.balanceMb)}. Use this to reverse a
              wrong allocation.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-800">
              Amount (GB)
              <Input
                type="number"
                step="1"
                min="0"
                className="admin-console-alloc-input mt-1 h-9 w-32"
                value={amountGb}
                onChange={(e) => setAmountGb(e.target.value)}
              />
            </label>
            <label className="min-w-[200px] flex-1 text-sm font-medium text-slate-800">
              Note {isDebit ? "(recommended)" : "(optional)"}
              <Input
                className="admin-console-alloc-input mt-1 h-9"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  isDebit ? "e.g. Corrected over-allocation" : "e.g. March iShare pool"
                }
              />
            </label>
            <Button
              size="sm"
              variant={isDebit ? "danger" : "default"}
              disabled={pending != null}
              onClick={() => void submitPanel()}
            >
              {isDebit ? "Debit console" : "Credit console"}
            </Button>
            <Button size="sm" variant="secondary" onClick={closePanel}>
              Cancel
            </Button>
          </div>
          <p className={cn("mt-2 text-xs", isDebit ? "text-red-800" : "text-blue-800")}>
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
                      variant="secondary"
                      disabled={pending != null || !row.enabled}
                      onClick={() => openPanel(row.vendorId, "api_key")}
                    >
                      API key
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending != null}
                      onClick={() => openPanel(row.vendorId, "credit")}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Allocate
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={pending != null || row.balanceMb <= 0}
                      onClick={() => openPanel(row.vendorId, "debit")}
                    >
                      <Minus className="h-3.5 w-3.5" />
                      Debit
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
