import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { reconcileAutoFulfilledOrders } from "@/lib/admin/order-fulfilment";
import {
  isApiProcessing,
  isAwaitingManualDelivery,
  isEffectivelyFailed,
  isEffectivelyFulfilled,
} from "@/lib/admin/order-board-status";
import { SUPPLIER_FAILED_STATUSES } from "@/lib/suppliers/delivery-status";
import {
  DEFAULT_ADMIN_ORDERS_LIMIT,
  resolveAdminOrdersDateRange,
  type AdminOrdersDatePeriod,
} from "@/lib/admin/order-board-date";
import { formatDataAmount } from "@/lib/format";
import { fetchStorefrontOrderBundlesBatch } from "@/lib/orders/storefront-listing";
import { wholesaleItemRefundReference, wholesaleOrderRefundReference } from "@/lib/payments/wallet";
import type { OrderStatus } from "@/lib/constants";
import type { NetworkId } from "@/lib/constants";

export type AdminOrdersNetworkFilter = "all" | NetworkId;

export type AdminOrderBoardNetworkCounts = Record<"all" | NetworkId, number>;

export function countAdminOrderBoardByNetwork(
  rows: AdminOrderBoardRow[],
): AdminOrderBoardNetworkCounts {
  const counts: AdminOrderBoardNetworkCounts = { all: rows.length, mtn: 0, telecel: 0, at: 0 };
  for (const row of rows) {
    if (row.network === "mtn") counts.mtn += 1;
    else if (row.network === "telecel") counts.telecel += 1;
    else if (row.network === "at") counts.at += 1;
  }
  return counts;
}

export type AdminOrderLineKind = "wholesale_item" | "customer";

export interface AdminOrderBoardRow {
  id: string;
  kind: AdminOrderLineKind;
  orderCode: string;
  packageName: string;
  network: string;
  dataMb: number;
  price: number;
  beneficiary: string;
  orderReference: string;
  dataVolume: string;
  orderedAt: string;
  agentName: string;
  agentSlug: string;
  orderType: string;
  paymentMethod: string;
  orderStatus: string;
  paymentStatus: string;
  commission: number | null;
  apiStatus: string | null;
  apiError: string | null;
  apiSource: string | null;
  apiReference: string | null;
  wholesaleOrderId?: string;
  wholesaleBundleId?: string;
  bundleActive?: boolean;
  walletRefunded?: boolean;
}

export type AdminOrdersFilterStatus =
  | "all"
  | "undelivered"
  | "queued"
  | "processing"
  | "fulfilled"
  | "failed"
  | "refunded"
  | "paid"
  | "pending";

export interface AdminOrdersBoardFilters {
  status?: AdminOrdersFilterStatus;
  kind?: "all" | "wholesale" | "customer";
  q?: string;
  limit?: number;
  period?: AdminOrdersDatePeriod | string;
  fromDate?: string;
  toDate?: string;
  agentSlug?: string;
  paymentMethod?: string;
  paymentStatus?: string;
}

export interface AdminOrderBoardAgentOption {
  slug: string;
  name: string;
}

export async function fetchAdminOrderBoardAgents(): Promise<AdminOrderBoardAgentOption[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("vendors")
    .select("business_name, slug")
    .eq("status", "approved")
    .order("business_name", { ascending: true });

  return ((data ?? []) as { business_name: string; slug: string }[])
    .filter((v) => v.slug)
    .map((v) => ({ slug: v.slug, name: v.business_name }));
}

async function resolveVendorIdBySlug(
  service: ReturnType<typeof createServiceClient>,
  slug: string,
): Promise<string | null> {
  const { data } = await service.from("vendors").select("id").eq("slug", slug).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** PostgREST `.or()` clause matching rows that failed by status or by supplier response. */
const FAILED_OR_CLAUSE = `status.eq.failed,supplier_status.in.(${SUPPLIER_FAILED_STATUSES.join(",")})`;

function rowMatchesPaymentStatus(row: AdminOrderBoardRow, paymentStatus: string): boolean {
  return row.paymentStatus.toLowerCase() === paymentStatus.toLowerCase();
}

function rowMatchesPaymentMethod(row: AdminOrderBoardRow, paymentMethod: string): boolean {
  return row.paymentMethod.toLowerCase() === paymentMethod.toLowerCase();
}

function vendorName(
  v: { business_name: string; slug: string } | { business_name: string; slug: string }[] | null,
): { name: string; slug: string } {
  const row = Array.isArray(v) ? v[0] : v;
  return { name: row?.business_name ?? "—", slug: row?.slug ?? "" };
}

/**
 * Payment outcome is separate from fulfilment/API delivery.
 * Wallet/Paystack capture can succeed while the supplier later rejects the send —
 * that must stay "completed" (or "refunded" once wallet money is returned), not "failed".
 */
function paymentStatusForOrder(
  status: string,
  paymentRef: string | null,
  paymentProvider: string | null = null,
): string {
  if (status === "refunded") return "refunded";
  if (status === "pending") return "pending";

  const paymentCaptured =
    Boolean(paymentRef?.trim()) ||
    ["wallet", "paystack", "moolre", "api"].includes((paymentProvider ?? "").toLowerCase()) ||
    ["paid", "queued", "processing", "fulfilled"].includes(status);

  if (paymentCaptured) return "completed";
  if (status === "failed") return "failed";
  return status;
}

export async function fetchAdminOrderBoardRows(
  filters: AdminOrdersBoardFilters = {},
): Promise<AdminOrderBoardRow[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  await reconcileAutoFulfilledOrders(service);

  const status = filters.status ?? "all";
  // "queued" is a legacy URL value — it now maps to the manual Undelivered bucket.
  const normalizedStatus = status === "queued" ? "undelivered" : status;
  const kind = filters.kind ?? "all";
  const limit = Math.min(1000, Math.max(10, filters.limit ?? DEFAULT_ADMIN_ORDERS_LIMIT));
  const q = (filters.q ?? "").trim().toLowerCase();
  const dateRange = resolveAdminOrdersDateRange({
    period: filters.period,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
  });
  const agentSlug = (filters.agentSlug ?? "").trim();
  const paymentMethod = (filters.paymentMethod ?? "").trim();
  const paymentStatus = (filters.paymentStatus ?? "").trim();

  let vendorId: string | null = null;
  if (agentSlug) {
    vendorId = await resolveVendorIdBySlug(service, agentSlug);
    if (!vendorId) return [];
  }

  const rows: AdminOrderBoardRow[] = [];

  if (kind !== "customer") {
    let itemQuery = service
      .from("wholesale_order_items")
      .select(
        `
        id, recipient_phone, unit_price, line_total, status, supplier_order_code, supplier_status, supplier_error, created_at,
        wholesale_orders!inner (
          id, reference, status, source, payment_provider, payment_reference, supplier, supplier_reference, supplier_status, supplier_error, created_at,
          vendors!inner ( business_name, slug )
        ),
        wholesale_bundles!inner ( id, name, network, data_mb, sku, active )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateRange.from) itemQuery = itemQuery.gte("created_at", dateRange.from);
    if (dateRange.to) itemQuery = itemQuery.lte("created_at", dateRange.to);
    if (vendorId) itemQuery = itemQuery.eq("wholesale_orders.vendor_id", vendorId);
    if (paymentMethod) itemQuery = itemQuery.eq("wholesale_orders.payment_provider", paymentMethod);

    if (status !== "all") {
      if (normalizedStatus === "undelivered") {
        // Manual delivery bucket — API has not accepted these lines.
        itemQuery = itemQuery.in("status", ["queued", "pending"]);
      } else if (normalizedStatus === "processing") {
        // API-connected bucket — a supplier accepted and is handling delivery.
        itemQuery = itemQuery.eq("status", "processing");
      } else if (normalizedStatus === "failed") {
        // Failed by line status OR by supplier response (even if still stuck on queued).
        itemQuery = itemQuery.or(FAILED_OR_CLAUSE);
      } else if (normalizedStatus === "fulfilled") {
        itemQuery = itemQuery.eq("status", "fulfilled");
      } else {
        itemQuery = itemQuery.eq("status", normalizedStatus);
      }
    }

    const { data } = await itemQuery;

    for (const raw of data ?? []) {
      const row = raw as {
        id: string;
        recipient_phone: string;
        unit_price: number;
        line_total: number;
        status: string;
        supplier_order_code: string | null;
        supplier_status: string | null;
        supplier_error: string | null;
        created_at: string;
        wholesale_orders:
          | {
              id: string;
              reference: string;
              status: string;
              source: string;
              payment_provider: string | null;
              payment_reference: string | null;
              supplier: string | null;
              supplier_reference: string | null;
              supplier_status: string | null;
              supplier_error: string | null;
              created_at: string;
              vendors: { business_name: string; slug: string } | { business_name: string; slug: string }[];
            }
          | Array<{
              id: string;
              reference: string;
              status: string;
              source: string;
              payment_provider: string | null;
              payment_reference: string | null;
              supplier: string | null;
              supplier_reference: string | null;
              supplier_status: string | null;
              supplier_error: string | null;
              created_at: string;
              vendors: { business_name: string; slug: string } | { business_name: string; slug: string }[];
            }>;
        wholesale_bundles:
          | { id: string; name: string; network: string; data_mb: number; sku: string; active: boolean }
          | { id: string; name: string; network: string; data_mb: number; sku: string; active: boolean }[];
      };

      const order = Array.isArray(row.wholesale_orders)
        ? row.wholesale_orders[0]
        : row.wholesale_orders;
      const bundle = Array.isArray(row.wholesale_bundles)
        ? row.wholesale_bundles[0]
        : row.wholesale_bundles;
      if (!order || !bundle) continue;

      const agent = vendorName(order.vendors);
      const orderCode = row.supplier_order_code ?? order.reference;
      const line: AdminOrderBoardRow = {
        id: row.id,
        kind: "wholesale_item",
        orderCode,
        packageName: bundle.name,
        network: bundle.network,
        dataMb: bundle.data_mb,
        price: Number(row.line_total ?? row.unit_price),
        beneficiary: row.recipient_phone,
        orderReference: order.reference,
        dataVolume: formatDataAmount(bundle.data_mb),
        orderedAt: row.created_at,
        agentName: agent.name,
        agentSlug: agent.slug,
        orderType: order.source === "bulk" ? "bulk" : order.source === "manual" ? "internal" : "wholesale",
        paymentMethod: order.payment_provider ?? "wallet",
        orderStatus: row.status,
        paymentStatus: paymentStatusForOrder(
          order.status,
          order.payment_reference,
          order.payment_provider,
        ),
        commission: null,
        apiStatus: row.supplier_status ?? order.supplier_status ?? row.status,
        apiError: row.supplier_error ?? order.supplier_error ?? null,
        apiSource: order.supplier ?? "skanka5",
        // Prefer per-line supplier txn code (e.g. Shop DCS txn_…) over parent bulk ref.
        apiReference: row.supplier_order_code ?? order.supplier_reference,
        wholesaleOrderId: order.id,
        wholesaleBundleId: bundle.id,
        bundleActive: bundle.active,
      };

      if (q) {
        const hay = [
          line.orderCode,
          line.orderReference,
          line.beneficiary,
          line.packageName,
          line.agentName,
          line.agentSlug,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }

      rows.push(line);
    }
  }

  if (kind !== "wholesale") {
    let orderQuery = service
      .from("orders")
      .select(
        `
        id, reference, recipient_phone, amount, platform_fee, status, payment_provider, payment_reference,
        supplier, supplier_reference, supplier_order_code, supplier_status, supplier_error, created_at, bundle_id,
        vendors!inner ( business_name, slug )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (dateRange.from) orderQuery = orderQuery.gte("created_at", dateRange.from);
    if (dateRange.to) orderQuery = orderQuery.lte("created_at", dateRange.to);
    if (vendorId) orderQuery = orderQuery.eq("vendor_id", vendorId);
    if (paymentMethod) orderQuery = orderQuery.eq("payment_provider", paymentMethod);

    if (status !== "all") {
      if (normalizedStatus === "undelivered") {
        orderQuery = orderQuery.in("status", ["paid", "queued"]);
      } else if (normalizedStatus === "processing") {
        orderQuery = orderQuery.eq("status", "processing");
      } else if (normalizedStatus === "failed") {
        orderQuery = orderQuery.or(FAILED_OR_CLAUSE);
      } else {
        orderQuery = orderQuery.eq("status", normalizedStatus as OrderStatus);
      }
    }

    const { data } = await orderQuery;

    const bundleMap = await fetchStorefrontOrderBundlesBatch(
      service,
      (data ?? []).map((raw: Record<string, unknown>) => (raw as { bundle_id: string }).bundle_id),
    );

    for (const raw of data ?? []) {
      const row = raw as {
        id: string;
        reference: string;
        recipient_phone: string;
        amount: number;
        platform_fee: number;
        status: string;
        payment_provider: string | null;
        payment_reference: string | null;
        supplier: string | null;
        supplier_reference: string | null;
        supplier_order_code: string | null;
        supplier_status: string | null;
        supplier_error: string | null;
        created_at: string;
        bundle_id: string;
        vendors: { business_name: string; slug: string } | { business_name: string; slug: string }[];
      };

      const bundle = bundleMap.get(row.bundle_id);
      const agent = vendorName(row.vendors);
      const commission = Math.max(0, Number(row.amount) - Number(row.platform_fee));

      const line: AdminOrderBoardRow = {
        id: row.id,
        kind: "customer",
        orderCode: row.supplier_order_code ?? row.reference,
        packageName: bundle?.name ?? "Bundle",
        network: bundle?.network ?? "",
        dataMb: bundle?.data_mb ?? 0,
        price: Number(row.amount),
        beneficiary: row.recipient_phone,
        orderReference: row.reference,
        dataVolume: bundle ? formatDataAmount(bundle.data_mb) : "—",
        orderedAt: row.created_at,
        agentName: agent.name,
        agentSlug: agent.slug,
        orderType: "storefront",
        paymentMethod: row.payment_provider ?? "—",
        orderStatus: row.status,
        paymentStatus: paymentStatusForOrder(
          row.status,
          row.payment_reference,
          row.payment_provider,
        ),
        commission,
        apiStatus: row.supplier_status ?? row.status,
        apiError: row.supplier_error ?? null,
        apiSource: row.supplier,
        apiReference: row.supplier_reference,
      };

      if (q) {
        const hay = [
          line.orderCode,
          line.orderReference,
          line.beneficiary,
          line.packageName,
          line.agentName,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }

      rows.push(line);
    }
  }

  const wholesaleRows = rows.filter((r) => r.kind === "wholesale_item");
  if (wholesaleRows.length > 0) {
    const refundRefs = wholesaleRows.flatMap((r) => [
      wholesaleItemRefundReference(r.id),
      wholesaleOrderRefundReference(r.orderReference),
    ]);
    const { data: refundLedger } = await service
      .from("wallet_ledger")
      .select("reference")
      .eq("entry_type", "refund")
      .in("reference", refundRefs);

    const refundedRefs = new Set(
      ((refundLedger ?? []) as { reference: string }[]).map((r) => r.reference),
    );

    for (const row of wholesaleRows) {
      row.walletRefunded =
        refundedRefs.has(wholesaleItemRefundReference(row.id)) ||
        refundedRefs.has(wholesaleOrderRefundReference(row.orderReference));
      if (row.walletRefunded) {
        row.paymentStatus = "refunded";
      }
    }
  }

  // Apply pay-status filter after refund annotation so refunded wallet lines classify correctly.
  const paymentFiltered = paymentStatus
    ? rows.filter((row) => rowMatchesPaymentStatus(row, paymentStatus))
    : rows;

  const sorted = paymentFiltered.sort(
    (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
  );

  if (normalizedStatus === "undelivered") {
    return sorted.filter((row) => isAwaitingManualDelivery(row));
  }

  if (normalizedStatus === "processing") {
    return sorted.filter((row) => isApiProcessing(row));
  }

  if (normalizedStatus === "failed") {
    return sorted.filter((row) => isEffectivelyFailed(row));
  }

  return sorted;
}
