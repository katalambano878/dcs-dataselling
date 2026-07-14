"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Package, PackageX, Plus, Save, Trash2 } from "lucide-react";
import { WishlistToggle } from "@/components/wishlist/wishlist-toggle";
import { toast } from "sonner";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTh,
} from "@/components/admin";
import { NETWORKS, type NetworkId } from "@/lib/constants";
import { formatDataAmount } from "@/lib/format";
import type { WholesalePriceMatrix } from "@/lib/wholesale/tier-pricing";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Button } from "@/components/ui/button";
import type { AdminWholesaleRow } from "@/lib/data/wholesale";
import { cn } from "@/lib/utils";

interface Props {
  bundles: AdminWholesaleRow[];
  wishlistIds?: string[];
}

const EMPTY_PRICES: WholesalePriceMatrix = {
  costPrice: 0,
  customerPrice: 0,
  customerProPrice: 0,
  agentPrice: 0,
  agentProPrice: 0,
  xpressAgentPrice: 0,
  expressAgentPrice: 0,
};

function pricesFromRow(row: AdminWholesaleRow): WholesalePriceMatrix {
  return {
    costPrice: row.costPrice,
    customerPrice: row.customerPrice,
    customerProPrice: row.customerProPrice,
    agentPrice: row.agentPrice,
    agentProPrice: row.agentProPrice,
    xpressAgentPrice: row.xpressAgentPrice,
    expressAgentPrice: row.expressAgentPrice,
  };
}

type NetworkFilter = "all" | NetworkId;

/** Platform rule: 1 GB = 1000 MB. Preset picks for the Add bundle form. */
const DATA_SIZE_PRESETS: { label: string; mb: number }[] = [
  { label: "500MB", mb: 500 },
  ...Array.from({ length: 15 }, (_, i) => ({ label: `${i + 1}GB`, mb: (i + 1) * 1000 })),
];

function tierLadderWarning(prices: WholesalePriceMatrix): string | null {
  if (prices.costPrice > prices.agentProPrice) {
    return "Cost must be ≤ Pro Agent price.";
  }
  if (prices.agentProPrice > prices.xpressAgentPrice) {
    return "Pro must be ≤ Super Agent price.";
  }
  if (prices.xpressAgentPrice > prices.agentPrice) {
    return "Super must be ≤ Agent price.";
  }
  return null;
}

export function WholesaleAdmin({ bundles, wishlistIds = [] }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [stockPending, setStockPending] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>("all");

  const filteredRows = useMemo(() => {
    if (networkFilter === "all") return bundles;
    return bundles.filter((row) => row.network === networkFilter);
  }, [bundles, networkFilter]);

  const networkCounts = useMemo(() => {
    const counts: Record<NetworkId, number> = { mtn: 0, telecel: 0, at: 0 };
    for (const row of bundles) counts[row.network]++;
    return counts;
  }, [bundles]);
  const [customDataMb, setCustomDataMb] = useState(false);
  const [newBundle, setNewBundle] = useState({
    network: "mtn" as "mtn" | "telecel" | "at",
    name: "",
    dataMb: 1000,
    validityDays: 30,
    minMarkup: 0.5,
    productLine: "standard" as "standard" | "ishare" | "bigtime",
    prices: {
      ...EMPTY_PRICES,
      costPrice: 4,
      agentPrice: 5,
      xpressAgentPrice: 4.8,
      agentProPrice: 4.6,
      expressAgentPrice: 4,
    },
  });

  async function saveRow(row: AdminWholesaleRow, draft: Partial<AdminWholesaleRow> & { prices?: WholesalePriceMatrix }) {
    setPending(row.id);
    try {
      const res = await fetch(`/api/admin/wholesale/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prices: draft.prices,
          minMarkup: draft.minMarkup ?? row.minMarkup,
          maxMarkup: draft.maxMarkup ?? row.maxMarkup,
          active: draft.active ?? row.active,
          popular: draft.popular ?? row.popular,
          name: draft.name ?? row.name,
          productLine: draft.productLine ?? row.productLine ?? "standard",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Pricing updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function toggleStock(row: AdminWholesaleRow) {
    const nextActive = !row.active;
    const label = `${row.name} (${formatDataAmount(row.dataMb)})`;
    if (
      !nextActive &&
      !window.confirm(
        `Mark "${label}" out of stock? Agents will not be able to order it until you turn it back on.`,
      )
    ) {
      return;
    }

    setStockPending(row.id);
    try {
      const res = await fetch(`/api/admin/wholesale/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(nextActive ? "Package back in stock" : "Package marked out of stock");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setStockPending(null);
    }
  }

  async function deleteRow(row: AdminWholesaleRow) {
    const label = `${row.name} (${formatDataAmount(row.dataMb)})`;
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    setDeletingId(row.id);
    try {
      const res = await fetch(`/api/admin/wholesale/${row.id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Bundle deleted");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setDeletingId(null);
    }
  }

  async function addBundle() {
    setPending("new");
    try {
      const res = await fetch("/api/admin/wholesale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network: newBundle.network,
          name: newBundle.name,
          dataMb: newBundle.dataMb,
          validityDays: newBundle.validityDays,
          minMarkup: newBundle.minMarkup,
          productLine: newBundle.productLine,
          prices: newBundle.prices,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Bundle added to wholesale catalogue");
      setShowAdd(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <AdminSection
      title="Pricing matrix"
      description="Set the cost and the buy price for each agent role per bundle. Agents see their role's price at checkout."
      icon={Package}
      actions={
        <Button size="sm" variant="secondary" onClick={() => setShowAdd((s) => !s)}>
          <Plus className="h-3.5 w-3.5" />
          Add bundle
        </Button>
      }
    >
      {showAdd && (
        <div className="pricing-matrix admin-list-item mb-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-muted">
              Network
              <select
                className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                value={newBundle.network}
                onChange={(e) =>
                  setNewBundle((b) => ({
                    ...b,
                    network: e.target.value as "mtn" | "telecel" | "at",
                    productLine: e.target.value === "at" ? b.productLine : "standard",
                  }))
                }
              >
                {NETWORKS.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted">
              Name
              <input
                className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                value={newBundle.name}
                onChange={(e) => setNewBundle((b) => ({ ...b, name: e.target.value }))}
                placeholder="MTN 5GB"
              />
            </label>
            <label className="text-xs font-medium text-muted">
              Data size (1GB = 1000MB)
              <select
                className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                value={customDataMb ? "custom" : String(newBundle.dataMb)}
                onChange={(e) => {
                  if (e.target.value === "custom") {
                    setCustomDataMb(true);
                    return;
                  }
                  setCustomDataMb(false);
                  setNewBundle((b) => ({ ...b, dataMb: Number(e.target.value) }));
                }}
              >
                {DATA_SIZE_PRESETS.map((opt) => (
                  <option key={opt.mb} value={opt.mb}>
                    {opt.label}
                  </option>
                ))}
                <option value="custom">Custom (MB)…</option>
              </select>
              {customDataMb && (
                <input
                  type="number"
                  className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                  value={newBundle.dataMb}
                  placeholder="Enter MB e.g. 2500"
                  onChange={(e) =>
                    setNewBundle((b) => ({ ...b, dataMb: Number(e.target.value) }))
                  }
                />
              )}
            </label>
            <label className="text-xs font-medium text-muted">
              Validity (days)
              <input
                type="number"
                className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                value={newBundle.validityDays}
                onChange={(e) =>
                  setNewBundle((b) => ({ ...b, validityDays: Number(e.target.value) }))
                }
              />
            </label>
          </div>
          <PriceMatrixInputs
            prices={newBundle.prices}
            onChange={(prices) => setNewBundle((b) => ({ ...b, prices }))}
          />
          <p className="text-xs text-muted-foreground">
            Express ≤ Agent and Pro ≤ Super ≤ Agent. Express Agent is the admin-assigned tier (buys
            near cost). Storefront base is auto-set to at least Agent price + min markup (e.g. Agent
            ₵5 + markup ₵0.50 → retail ₵5.50).
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-medium text-muted">
              Min markup ₵
              <input
                type="number"
                step="0.01"
                className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                value={newBundle.minMarkup}
                onChange={(e) =>
                  setNewBundle((b) => ({ ...b, minMarkup: Number(e.target.value) }))
                }
              />
            </label>
            {newBundle.network === "at" && (
              <label className="text-xs font-medium text-muted">
                Product line
                <select
                  className="mt-1 flex h-9 w-full rounded-lg border border-border px-2.5 text-sm"
                  value={newBundle.productLine}
                  onChange={(e) =>
                    setNewBundle((b) => ({
                      ...b,
                      productLine: e.target.value as "standard" | "ishare" | "bigtime",
                    }))
                  }
                >
                  <option value="standard">Standard</option>
                  <option value="ishare">iShare</option>
                  <option value="bigtime">BigTime</option>
                </select>
              </label>
            )}
            <div className="flex items-end">
              <Button
                className="pricing-matrix-save-btn w-full"
                onClick={addBundle}
                disabled={pending === "new"}
              >
                {pending === "new" ? "Saving…" : "Create bundle"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {bundles.length === 0 ? (
        <AdminEmptyState
          icon={Package}
          title="No wholesale bundles"
          description="Add your first bundle to let agents purchase data at tier-specific prices."
        />
      ) : (
        <div className="pricing-matrix space-y-3">
          <div className="pricing-matrix-filters" role="tablist" aria-label="Filter by network">
            <button
              type="button"
              role="tab"
              aria-selected={networkFilter === "all"}
              className={cn("pricing-matrix-filter-tab", networkFilter === "all" && "is-active")}
              onClick={() => setNetworkFilter("all")}
            >
              All
              <span className="pricing-matrix-filter-count">{bundles.length}</span>
            </button>
            {NETWORKS.map((network) => (
              <button
                key={network.id}
                type="button"
                role="tab"
                aria-selected={networkFilter === network.id}
                className={cn(
                  "pricing-matrix-filter-tab",
                  `pricing-matrix-filter-${network.id}`,
                  networkFilter === network.id && "is-active",
                )}
                onClick={() => setNetworkFilter(network.id)}
              >
                {network.name}
                <span className="pricing-matrix-filter-count">{networkCounts[network.id]}</span>
              </button>
            ))}
          </div>

          {filteredRows.length === 0 ? (
            <AdminEmptyState
              icon={Package}
              title="No bundles for this network"
              description="Switch to another network tab or add a new bundle."
            />
          ) : (
            <AdminDataTable minWidth="960px">
              <AdminTableHead>
                <AdminTh>Volume</AdminTh>
                <AdminTh>Cost</AdminTh>
                <AdminTh>Express</AdminTh>
                <AdminTh>Agent</AdminTh>
                <AdminTh>Super</AdminTh>
                <AdminTh>Pro</AdminTh>
                <AdminTh>Status</AdminTh>
                <AdminTh className="pricing-matrix-actions-th">Actions</AdminTh>
              </AdminTableHead>
              <AdminTableBody>
                {filteredRows.map((row) => (
                  <WholesaleRowEditor
                    key={`${row.id}-${row.active ? "on" : "off"}`}
                    row={row}
                    saving={pending === row.id}
                    stockPending={stockPending === row.id}
                    onSave={saveRow}
                    onToggleStock={toggleStock}
                    onDelete={deleteRow}
                    deleting={deletingId === row.id}
                    wishlistSaved={wishlistIds.includes(row.id)}
                  />
                ))}
              </AdminTableBody>
            </AdminDataTable>
          )}
        </div>
      )}
    </AdminSection>
  );
}

function PriceMatrixInputs({
  prices,
  onChange,
  compact,
}: {
  prices: WholesalePriceMatrix;
  onChange: (p: WholesalePriceMatrix) => void;
  compact?: boolean;
}) {
  const fields: { key: keyof WholesalePriceMatrix; label: string }[] = [
    { key: "costPrice", label: "Cost ₵" },
    { key: "expressAgentPrice", label: "Express Agent ₵" },
    { key: "agentPrice", label: "Agent ₵" },
    { key: "xpressAgentPrice", label: "Super Agent ₵" },
    { key: "agentProPrice", label: "Pro Agent ₵" },
  ];

  return (
    <div className={compact ? "flex flex-wrap gap-1.5" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-5"}>
      {fields.map(({ key, label }) => (
        <label key={key} className="pricing-matrix-field-label">
          {!compact && label}
          <div className={compact ? "pricing-matrix-price-wrap pricing-matrix-price-wrap--compact" : "pricing-matrix-price-wrap"}>
            <span className="pricing-matrix-currency" aria-hidden>
              ₵
            </span>
            <input
              type="number"
              step="0.01"
              title={label}
              className="pricing-matrix-price-input num"
              value={prices[key]}
              onChange={(e) => onChange({ ...prices, [key]: Number(e.target.value) })}
            />
          </div>
        </label>
      ))}
    </div>
  );
}

function PriceInput({
  value,
  onChange,
  title,
  invalid,
}: {
  value: number;
  onChange: (v: number) => void;
  title: string;
  invalid?: boolean;
}) {
  return (
    <div className="pricing-matrix-price-wrap pricing-matrix-price-wrap--compact">
      <span className="pricing-matrix-currency" aria-hidden>
        ₵
      </span>
      <input
        type="number"
        step="0.01"
        title={title}
        className={cn("pricing-matrix-price-input num", invalid && "is-invalid")}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function WholesaleRowEditor({
  row,
  saving,
  stockPending = false,
  deleting = false,
  onSave,
  onToggleStock,
  onDelete,
  wishlistSaved = false,
}: {
  row: AdminWholesaleRow;
  saving: boolean;
  stockPending?: boolean;
  deleting?: boolean;
  onSave: (row: AdminWholesaleRow, draft: Partial<AdminWholesaleRow> & { prices?: WholesalePriceMatrix }) => void;
  onToggleStock: (row: AdminWholesaleRow) => void;
  onDelete: (row: AdminWholesaleRow) => void;
  wishlistSaved?: boolean;
}) {
  const [prices, setPrices] = useState(() => pricesFromRow(row));
  const [minMarkup, setMinMarkup] = useState(row.minMarkup);
  const [active, setActive] = useState(row.active);
  const [popular, setPopular] = useState(row.popular);
  const [productLine, setProductLine] = useState<"standard" | "ishare" | "bigtime">(
    row.productLine ?? "standard",
  );

  const base = pricesFromRow(row);
  const dirty =
    Object.keys(base).some((k) => prices[k as keyof WholesalePriceMatrix] !== base[k as keyof WholesalePriceMatrix]) ||
    minMarkup !== row.minMarkup ||
    active !== row.active ||
    popular !== row.popular ||
    (row.network === "at" && productLine !== (row.productLine ?? "standard"));

  const ladderWarning = tierLadderWarning(prices);
  const costInvalid = prices.costPrice > prices.agentProPrice;
  const proInvalid = prices.agentProPrice > prices.xpressAgentPrice;
  const superInvalid = prices.xpressAgentPrice > prices.agentPrice;
  const expressInvalid =
    prices.expressAgentPrice < prices.costPrice || prices.expressAgentPrice > prices.agentPrice;

  return (
    <tr
      className={cn(
        "admin-table-tr",
        dirty && "pricing-matrix-row-dirty",
        !row.active && "opacity-60",
      )}
    >
      <td className="admin-table-td">
        <div className="flex items-center gap-2">
          <NetworkBadge network={row.network} size="xs" />
          <div className="min-w-0">
            <p className="pricing-matrix-volume">{formatDataAmount(row.dataMb)}</p>
            <p className="pricing-matrix-meta">
              {row.name} · {row.validityDays}d · <span className="font-mono">{row.sku}</span>
            </p>
            {row.network === "at" && (
              <select
                className="pricing-matrix-product-line mt-1"
                value={productLine}
                onChange={(e) =>
                  setProductLine(e.target.value as "standard" | "ishare" | "bigtime")
                }
              >
                <option value="standard">Standard</option>
                <option value="ishare">iShare</option>
                <option value="bigtime">BigTime</option>
              </select>
            )}
            {ladderWarning && (
              <p className="pricing-matrix-warning mt-1" title={ladderWarning}>
                <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                <span>{ladderWarning}</span>
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="admin-table-td">
        <PriceInput
          title="Cost price"
          value={prices.costPrice}
          invalid={costInvalid}
          onChange={(v) => setPrices((p) => ({ ...p, costPrice: v }))}
        />
      </td>
      <td className="admin-table-td">
        <PriceInput
          title="Express Agent price"
          value={prices.expressAgentPrice}
          invalid={expressInvalid}
          onChange={(v) => setPrices((p) => ({ ...p, expressAgentPrice: v }))}
        />
      </td>
      <td className="admin-table-td">
        <PriceInput
          title="Agent price"
          value={prices.agentPrice}
          invalid={superInvalid}
          onChange={(v) => setPrices((p) => ({ ...p, agentPrice: v }))}
        />
      </td>
      <td className="admin-table-td">
        <PriceInput
          title="Super Agent price"
          value={prices.xpressAgentPrice}
          invalid={superInvalid || proInvalid}
          onChange={(v) => setPrices((p) => ({ ...p, xpressAgentPrice: v }))}
        />
      </td>
      <td className="admin-table-td">
        <PriceInput
          title="Pro Agent price"
          value={prices.agentProPrice}
          invalid={proInvalid || costInvalid}
          onChange={(v) => setPrices((p) => ({ ...p, agentProPrice: v }))}
        />
      </td>
      <td className="admin-table-td">
        <div className="pricing-matrix-status">
          {!row.active ? (
            <span className="pricing-matrix-status-chip bg-rose-50 text-rose-700 ring-1 ring-rose-200">
              Out of stock
            </span>
          ) : (
            <label className={cn("pricing-matrix-status-chip", active && "is-on")}>
              <input
                type="checkbox"
                className="sr-only"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              Active
            </label>
          )}
          <label className={cn("pricing-matrix-status-chip", popular && "is-on is-popular")}>
            <input
              type="checkbox"
              className="sr-only"
              checked={popular}
              onChange={(e) => setPopular(e.target.checked)}
            />
            Popular
          </label>
        </div>
      </td>
      <td className="admin-table-td">
        <div className="pricing-matrix-actions">
          <Button
            size="sm"
            variant={row.active ? "secondary" : "default"}
            disabled={saving || deleting || stockPending}
            onClick={() => void onToggleStock(row)}
            className={cn(
              "shrink-0",
              row.active && "text-rose-700 hover:bg-rose-50 hover:text-rose-800",
            )}
          >
            <PackageX className="h-3.5 w-3.5" />
            {stockPending ? "…" : row.active ? "Out of stock" : "Back in stock"}
          </Button>
          <WishlistToggle
            bundleId={row.id}
            apiBase="/api/admin/wishlist"
            initialSaved={wishlistSaved}
            className="pricing-matrix-wishlist"
          />
          <Button
            size="sm"
            className="pricing-matrix-save-btn"
            disabled={!dirty || saving || deleting || stockPending}
            onClick={() =>
              onSave(row, {
                prices,
                minMarkup,
                active,
                popular,
                productLine: row.network === "at" ? productLine : "standard",
              })
            }
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || deleting}
            onClick={() => onDelete(row)}
            aria-label={`Delete ${row.name}`}
            className="pricing-matrix-delete-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleting ? "…" : "Delete"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
