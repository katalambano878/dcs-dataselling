"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ChevronDown,
  ClipboardList,
  ClipboardPaste,
  Download,
  PackageX,
  RefreshCw,
  Search,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  AdminOrderBoardAgentOption,
  AdminOrderBoardRow,
  AdminOrderBoardNetworkCounts,
  AdminOrdersNetworkFilter,
} from "@/lib/data/admin-orders-board";
import { downloadOrdersCsv } from "@/lib/admin/orders-export";
import { isEffectivelyFulfilled } from "@/lib/admin/order-board-status";
import {
  ADMIN_ORDERS_DATE_PRESETS,
  ADMIN_ORDERS_ENTRY_LIMITS,
  buildAdminOrdersSearchParams,
  type AdminOrdersDatePeriod,
} from "@/lib/admin/order-board-date";
import { buildBulkExcelClipboard, dataMbToVolumeGb } from "@/lib/wholesale/bulk-format";
import { NETWORKS } from "@/lib/constants";
import { formatGHS, formatPhone } from "@/lib/format";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral" | "default"> = {
  fulfilled: "success",
  paid: "default",
  queued: "warning",
  processing: "warning",
  pending: "neutral",
  failed: "danger",
  refunded: "danger",
};

const FILTER_STATUS = [
  { value: "all", label: "All statuses" },
  { value: "processing", label: "Work queue (queued + processing)" },
  { value: "fulfilled", label: "Delivered" },
  { value: "failed", label: "Undelivered" },
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
] as const;

const FILTER_KIND = [
  { value: "all", label: "All order types" },
  { value: "wholesale", label: "Agent wholesale lines" },
  { value: "customer", label: "Storefront orders" },
] as const;

const WHOLESALE_BULK_STATUS = [
  { value: "queued", label: "Set to queued" },
  { value: "processing", label: "Set to processing" },
  { value: "fulfilled", label: "Mark delivered" },
  { value: "failed", label: "Mark undelivered" },
] as const;

/** Row ⋮ menu labels — aligned with ops workflow (Set → Process → Deliver → Refund). */
const WHOLESALE_ROW_ACTIONS = [
  { value: "queued", label: "Set to queued" },
  { value: "processing", label: "Process order" },
  { value: "fulfilled", label: "Deliver order" },
  { value: "failed", label: "Mark undelivered" },
] as const;

const CUSTOMER_ROW_ACTIONS = [
  { value: "queued", label: "Set to queued" },
  { value: "processing", label: "Process order" },
  { value: "fulfilled", label: "Deliver order" },
  { value: "failed", label: "Mark failed" },
  { value: "refunded", label: "Refund order" },
] as const;

const REFUNDABLE_WHOLESALE_STATUSES = new Set(["failed", "processing", "queued", "pending"]);

const CUSTOMER_BULK_STATUS = [
  { value: "queued", label: "Set to queued" },
  { value: "processing", label: "Set to processing" },
  { value: "fulfilled", label: "Mark delivered" },
  { value: "failed", label: "Mark failed" },
  { value: "refunded", label: "Refund" },
] as const;

const FILTER_PAYMENT = [
  { value: "", label: "All payment methods" },
  { value: "wallet", label: "Wallet" },
  { value: "paystack", label: "Paystack" },
  { value: "api", label: "API" },
] as const;

const FILTER_PAY_STATUS = [
  { value: "", label: "All payment statuses" },
  { value: "completed", label: "Completed" },
  { value: "pending", label: "Pending" },
  { value: "refunded", label: "Refunded" },
  { value: "failed", label: "Failed" },
] as const;

function rowKey(row: AdminOrderBoardRow) {
  return `${row.kind}:${row.id}`;
}

interface BoardFilters {
  status: string;
  kind: string;
  network: string;
  q: string;
  period: AdminOrdersDatePeriod;
  fromDate: string;
  toDate: string;
  limit: number;
  agent: string;
  payment: string;
  payStatus: string;
}

interface Props {
  rows: AdminOrderBoardRow[];
  initialStatus: string;
  initialKind: string;
  initialNetwork: AdminOrdersNetworkFilter;
  initialQ: string;
  initialPeriod: AdminOrdersDatePeriod;
  initialFromDate: string;
  initialToDate: string;
  initialLimit: number;
  initialAgent: string;
  initialPayment: string;
  initialPayStatus: string;
  dateLabel: string;
  agents: AdminOrderBoardAgentOption[];
  networkCounts: AdminOrderBoardNetworkCounts;
}

export function AdminOrdersBoard({
  rows,
  initialStatus,
  initialKind,
  initialNetwork,
  initialQ,
  initialPeriod,
  initialFromDate,
  initialToDate,
  initialLimit,
  initialAgent,
  initialPayment,
  initialPayStatus,
  dateLabel,
  agents,
  networkCounts,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(initialQ);
  const [customFrom, setCustomFrom] = useState(initialFromDate);
  const [customTo, setCustomTo] = useState(initialToDate);
  const [bulkStatus, setBulkStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [actionOpen, setActionOpen] = useState<string | null>(null);

  const currentFilters: BoardFilters = {
    status: initialStatus,
    kind: initialKind,
    network: initialNetwork,
    q: search,
    period: initialPeriod,
    fromDate: customFrom,
    toDate: customTo,
    limit: initialLimit,
    agent: initialAgent,
    payment: initialPayment,
    payStatus: initialPayStatus,
  };

  function navigate(filters: BoardFilters) {
    const qs = buildAdminOrdersSearchParams({
      status: filters.status,
      kind: filters.kind,
      network: filters.network,
      q: filters.q,
      period: filters.period,
      from: filters.fromDate,
      to: filters.toDate,
      limit: filters.limit,
      agent: filters.agent,
      payment: filters.payment,
      payStatus: filters.payStatus,
    });
    router.push(qs ? `/admin/orders?${qs}` : "/admin/orders");
    setSelected(new Set());
  }

  function applyFilters(patch: Partial<BoardFilters>) {
    navigate({ ...currentFilters, ...patch });
  }

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(rowKey(r))),
    [rows, selected],
  );

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0;

  const wholesaleSelected = selectedRows.some((r) => r.kind === "wholesale_item");
  const customerSelected = selectedRows.some((r) => r.kind === "customer");
  const mixedKinds = wholesaleSelected && customerSelected;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map(rowKey)));
    }
  }

  function toggleRow(row: AdminOrderBoardRow) {
    const key = rowKey(row);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function runBulkStatus(status: string, targetRows: AdminOrderBoardRow[]) {
    if (!status || targetRows.length === 0) return;

    const byKind = {
      wholesale_item: targetRows.filter((r) => r.kind === "wholesale_item"),
      customer: targetRows.filter((r) => r.kind === "customer"),
    };

    setPending(true);
    try {
      let totalUpdated = 0;
      for (const kind of ["wholesale_item", "customer"] as const) {
        const group = byKind[kind];
        if (group.length === 0) continue;
        const res = await fetch("/api/admin/orders/bulk-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, ids: group.map((r) => r.id), status }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Bulk update failed");
        totalUpdated += Number(data.updated ?? 0);
        if (data.failed > 0) {
          toast.warning(`${data.failed} row(s) could not be updated`);
        }
      }
      toast.success(`Updated ${totalUpdated} order(s)`);
      setSelected(new Set());
      setBulkStatus("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setPending(false);
    }
  }

  function exportRows() {
    const base = selectedRows.length > 0 ? selectedRows : rows;
    if (initialStatus === "processing" || initialStatus === "queued") {
      return base.filter((row) => !isEffectivelyFulfilled(row));
    }
    return base;
  }

  function handleExport() {
    const target = exportRows();
    if (target.length === 0) {
      toast.error("No orders to export");
      return;
    }
    const stamp = format(new Date(), "yyyy-MM-dd-HHmm");
    const networkSlug = initialNetwork !== "all" ? `-${initialNetwork}` : "";
    downloadOrdersCsv(target, `dcs-orders${networkSlug}-${stamp}.csv`);
    toast.success(
      `Exported ${target.length} row(s) — Number + Volume columns ready for bulk paste`,
    );
  }

  async function handleCopyForPaste() {
    const target = exportRows();
    if (target.length === 0) {
      toast.error("No orders to copy");
      return;
    }
    const clipboard = buildBulkExcelClipboard(
      target.map((r) => ({
        phone: r.beneficiary,
        volumeGb: dataMbToVolumeGb(r.dataMb),
      })),
    );
    if (!clipboard) {
      toast.error("Selected rows have no phone or volume");
      return;
    }
    const rowCount = clipboard.split("\n").length - 1;
    try {
      await navigator.clipboard.writeText(clipboard);
      toast.success(
        `Copied ${rowCount} row(s) — paste into Excel (Number + Volume columns)`,
      );
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function rowAction(row: AdminOrderBoardRow, status: string) {
    setActionOpen(null);
    await runBulkStatus(status, [row]);
  }

  function isWalletPaidWholesale(row: AdminOrderBoardRow) {
    return (
      row.kind === "wholesale_item" &&
      (row.paymentMethod === "wallet" || row.paymentMethod === "api")
    );
  }

  function canRefundRow(row: AdminOrderBoardRow) {
    return (
      isWalletPaidWholesale(row) &&
      !row.walletRefunded &&
      REFUNDABLE_WHOLESALE_STATUSES.has(row.orderStatus)
    );
  }

  function refundBlockReason(row: AdminOrderBoardRow): string | null {
    if (!isWalletPaidWholesale(row)) return "Only wallet-paid agent orders can be refunded here";
    if (row.walletRefunded) return "Already refunded to wallet";
    if (row.orderStatus === "fulfilled") return "Delivered orders cannot be refunded";
    if (!REFUNDABLE_WHOLESALE_STATUSES.has(row.orderStatus)) {
      return "This order status cannot be refunded";
    }
    return null;
  }

  async function refundRow(row: AdminOrderBoardRow) {
    const blockReason = refundBlockReason(row);
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    if (
      !window.confirm(
        `Refund ${formatGHS(row.price)} to ${row.agentName}'s wallet for order ${row.orderReference}? The agent will be notified by SMS.`,
      )
    ) {
      return;
    }

    setActionOpen(null);
    setPending(true);
    try {
      const res = await fetch("/api/admin/orders/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "wholesale_item", id: row.id }),
      });
      const data = (await res.json()) as {
        error?: string;
        amount?: number;
        notified?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Refund failed");

      toast.success(
        data.notified
          ? `Refunded ${formatGHS(data.amount ?? row.price)} — agent notified by SMS`
          : `Refunded ${formatGHS(data.amount ?? row.price)} to wallet`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refund failed");
    } finally {
      setPending(false);
    }
  }

  async function toggleBundleStock(row: AdminOrderBoardRow) {
    if (!row.wholesaleBundleId || row.bundleActive == null) return;

    const nextActive = !row.bundleActive;
    if (
      !nextActive &&
      !window.confirm(
        `Mark "${row.packageName}" out of stock? Agents will not be able to order it until you turn it back on.`,
      )
    ) {
      return;
    }

    setActionOpen(null);
    setPending(true);
    try {
      const res = await fetch(`/api/admin/wholesale/${row.wholesaleBundleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: nextActive }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update stock");

      toast.success(
        nextActive ? `${row.packageName} back in stock` : `${row.packageName} marked out of stock`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update stock");
    } finally {
      setPending(false);
    }
  }

  const bulkOptions =
    mixedKinds || wholesaleSelected
      ? WHOLESALE_BULK_STATUS
      : customerSelected
        ? CUSTOMER_BULK_STATUS
        : WHOLESALE_BULK_STATUS;

  return (
    <AdminSection
      title="Order board"
      description="Partition by network before export or bulk status. Date defaults to today — widen the range to see older orders."
    >
      <div className="pricing-matrix mb-4 space-y-3">
        <div className="pricing-matrix-filters" role="tablist" aria-label="Filter by network">
          <button
            type="button"
            role="tab"
            aria-selected={initialNetwork === "all"}
            className={cn("pricing-matrix-filter-tab", initialNetwork === "all" && "is-active")}
            onClick={() => applyFilters({ network: "all" })}
          >
            All
            <span className="pricing-matrix-filter-count">{networkCounts.all}</span>
          </button>
          {NETWORKS.map((network) => (
            <button
              key={network.id}
              type="button"
              role="tab"
              aria-selected={initialNetwork === network.id}
              className={cn(
                "pricing-matrix-filter-tab",
                `pricing-matrix-filter-${network.id}`,
                initialNetwork === network.id && "is-active",
              )}
              onClick={() => applyFilters({ network: network.id })}
            >
              {network.name}
              <span className="pricing-matrix-filter-count">{networkCounts[network.id]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialPeriod}
            onChange={(e) =>
              applyFilters({ period: e.target.value as AdminOrdersDatePeriod })
            }
          >
            {ADMIN_ORDERS_DATE_PRESETS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {initialPeriod === "custom" ? (
            <>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">to</span>
              <Input
                type="date"
                className="h-9 w-[150px]"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => applyFilters({ fromDate: customFrom, toDate: customTo })}
              >
                Apply dates
              </Button>
            </>
          ) : null}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {dateLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialStatus}
            onChange={(e) => applyFilters({ status: e.target.value })}
          >
            {FILTER_STATUS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialKind}
            onChange={(e) => applyFilters({ kind: e.target.value })}
          >
            {FILTER_KIND.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 min-w-[140px] rounded-lg border border-border px-3 text-sm"
            value={initialAgent}
            onChange={(e) => applyFilters({ agent: e.target.value })}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialPayment}
            onChange={(e) => applyFilters({ payment: e.target.value })}
          >
            {FILTER_PAYMENT.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialPayStatus}
            onChange={(e) => applyFilters({ payStatus: e.target.value })}
          >
            {FILTER_PAY_STATUS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="h-9 rounded-lg border border-border px-3 text-sm"
            value={initialLimit}
            onChange={(e) => applyFilters({ limit: Number(e.target.value) })}
          >
            {ADMIN_ORDERS_ENTRY_LIMITS.map((n) => (
              <option key={n} value={n}>
                Show {n}
              </option>
            ))}
          </select>
          <form
            className="flex min-w-[200px] flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters({ q: search });
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-9"
                placeholder="Search code, phone, agent…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary">
              Filter
            </Button>
          </form>
        </div>

        <div className="admin-action-bar flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/90 hover:text-white"
            onClick={toggleAll}
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-amber-400" />
            ) : (
              <Square className="h-4 w-4 text-white/55" />
            )}
            {allSelected ? "Unmark all" : "Mark all"}
          </button>
          <span className="text-xs text-muted-foreground">
            {someSelected ? `${selected.size} selected` : `${rows.length} rows`}
          </span>
          {mixedKinds && (
            <span className="text-xs text-amber-700">
              Select only wholesale or only storefront rows for bulk status
            </span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-lg border border-border px-2 text-sm disabled:opacity-50"
              value={bulkStatus}
              disabled={!someSelected || mixedKinds || pending}
              onChange={(e) => setBulkStatus(e.target.value)}
            >
              <option value="">Bulk action…</option>
              {bulkOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="secondary"
              disabled={!bulkStatus || !someSelected || mixedKinds || pending}
              onClick={() => void runBulkStatus(bulkStatus, selectedRows)}
            >
              <RefreshCw className={cn("mr-1 h-3.5 w-3.5", pending && "animate-spin")} />
              Update status
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={rows.length === 0}
              onClick={() => void handleCopyForPaste()}
            >
              <ClipboardPaste className="mr-1 h-3.5 w-3.5" />
              Copy for Excel
            </Button>
            <Button size="sm" variant="secondary" disabled={rows.length === 0} onClick={handleExport}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Export bulk CSV
            </Button>
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={ClipboardList}
          title="No orders match this filter"
          description="Try another date range, network tab, or status filter. Orders default to today only."
        />
      ) : (
        <AdminDataTable minWidth="1400px">
          <AdminTableHead>
            <AdminTh className="w-10">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Mark all"
              />
            </AdminTh>
            <AdminTh>Order code</AdminTh>
            <AdminTh>Package</AdminTh>
            <AdminTh>Price</AdminTh>
            <AdminTh>Beneficiary</AdminTh>
            <AdminTh>Reference</AdminTh>
            <AdminTh>Data</AdminTh>
            <AdminTh>Ordered</AdminTh>
            <AdminTh>Agent</AdminTh>
            <AdminTh>Type</AdminTh>
            <AdminTh>Payment</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Pay status</AdminTh>
            <AdminTh>Commission</AdminTh>
            <AdminTh>API status</AdminTh>
            <AdminTh>API source</AdminTh>
            <AdminTh>API ref</AdminTh>
            <AdminTh className="w-12">Action</AdminTh>
          </AdminTableHead>
          <AdminTableBody>
            {rows.map((row) => {
              const key = rowKey(row);
              const isSelected = selected.has(key);
              return (
                <AdminTr key={key} className={isSelected ? "bg-amber-50/50" : undefined}>
                  <AdminTd>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={isSelected}
                      onChange={() => toggleRow(row)}
                      aria-label={`Select ${row.orderCode}`}
                    />
                  </AdminTd>
                  <AdminTd className="font-mono text-xs font-semibold">{row.orderCode}</AdminTd>
                  <AdminTd className="max-w-[140px] truncate">{row.packageName}</AdminTd>
                  <AdminTd className="num font-medium">{formatGHS(row.price)}</AdminTd>
                  <AdminTd>{formatPhone(row.beneficiary)}</AdminTd>
                  <AdminTd className="font-mono text-xs text-muted">{row.orderReference}</AdminTd>
                  <AdminTd>{row.dataVolume}</AdminTd>
                  <AdminTd className="whitespace-nowrap text-xs text-muted">
                    {format(new Date(row.orderedAt), "yyyy-MM-dd HH:mm")}
                  </AdminTd>
                  <AdminTd>
                    <span className="block text-sm">{row.agentName}</span>
                    {row.agentSlug ? (
                      <span className="text-xs text-muted">@{row.agentSlug}</span>
                    ) : null}
                  </AdminTd>
                  <AdminTd className="capitalize text-xs">{row.orderType}</AdminTd>
                  <AdminTd className="capitalize text-xs">{row.paymentMethod}</AdminTd>
                  <AdminTd>
                    <Badge variant={STATUS_VARIANT[row.orderStatus] ?? "default"}>
                      {row.orderStatus}
                    </Badge>
                  </AdminTd>
                  <AdminTd className="text-xs capitalize">{row.paymentStatus}</AdminTd>
                  <AdminTd className="num text-xs">
                    {row.commission != null ? formatGHS(row.commission) : "—"}
                  </AdminTd>
                  <AdminTd className="max-w-[100px] truncate text-xs">{row.apiStatus ?? "—"}</AdminTd>
                  <AdminTd className="text-xs">{row.apiSource ?? "—"}</AdminTd>
                  <AdminTd className="max-w-[90px] truncate font-mono text-xs">
                    {row.apiReference ?? "—"}
                  </AdminTd>
                  <AdminTd className="relative">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 gap-1 bg-blue-600 px-3 text-white hover:bg-blue-700"
                      aria-label="Actions"
                      aria-expanded={actionOpen === key}
                      disabled={pending}
                      onClick={() => setActionOpen(actionOpen === key ? null : key)}
                    >
                      Actions
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {actionOpen === key && (
                      <div
                        className="absolute right-0 top-full z-20 min-w-[200px] rounded-lg border border-slate-200 py-1 shadow-lg"
                        style={{ backgroundColor: "#ffffff", color: "#334155" }}
                      >
                        {(row.kind === "wholesale_item"
                          ? WHOLESALE_ROW_ACTIONS
                          : CUSTOMER_ROW_ACTIONS
                        ).map((o) => (
                          <button
                            key={o.value}
                            type="button"
                            className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                            disabled={pending}
                            onClick={() => void rowAction(row, o.value)}
                          >
                            {o.label}
                          </button>
                        ))}
                        {isWalletPaidWholesale(row) ? (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <button
                              type="button"
                              className={cn(
                                "block w-full px-3 py-2 text-left text-sm",
                                canRefundRow(row)
                                  ? "font-semibold text-blue-700 hover:bg-blue-50"
                                  : "cursor-not-allowed text-slate-400",
                              )}
                              disabled={pending || !canRefundRow(row)}
                              title={refundBlockReason(row) ?? undefined}
                              onClick={() => void refundRow(row)}
                            >
                              Refund order
                            </button>
                            {row.walletRefunded ? (
                              <p className="px-3 pb-1 text-xs text-muted-foreground">
                                Refunded to agent wallet
                              </p>
                            ) : null}
                          </>
                        ) : null}
                        {row.wholesaleBundleId && row.bundleActive != null ? (
                          <>
                            <div className="my-1 border-t border-slate-100" />
                            <button
                              type="button"
                              className={cn(
                                "block w-full px-3 py-2 text-left text-sm hover:bg-slate-50",
                                row.bundleActive
                                  ? "font-semibold text-rose-700 hover:bg-rose-50"
                                  : "font-semibold text-emerald-700 hover:bg-emerald-50",
                              )}
                              disabled={pending}
                              onClick={() => void toggleBundleStock(row)}
                            >
                              {row.bundleActive ? "Mark package out of stock" : "Back in stock"}
                            </button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </AdminTd>
                </AdminTr>
              );
            })}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </AdminSection>
  );
}
