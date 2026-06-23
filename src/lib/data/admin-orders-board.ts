import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { formatDataAmount } from "@/lib/format";
import { fetchStorefrontOrderBundlesBatch } from "@/lib/orders/storefront-listing";
import { wholesaleItemRefundReference, wholesaleOrderRefundReference } from "@/lib/payments/wallet";
import type { OrderStatus } from "@/lib/constants";

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
  apiSource: string | null;
  apiReference: string | null;
  wholesaleOrderId?: string;
  wholesaleBundleId?: string;
  bundleActive?: boolean;
  walletRefunded?: boolean;
}

export type AdminOrdersFilterStatus =
  | "all"
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
}

function vendorName(
  v: { business_name: string; slug: string } | { business_name: string; slug: string }[] | null,
): { name: string; slug: string } {
  const row = Array.isArray(v) ? v[0] : v;
  return { name: row?.business_name ?? "—", slug: row?.slug ?? "" };
}

function paymentStatusForOrder(status: string, paymentRef: string | null): string {
  if (["paid", "queued", "processing", "fulfilled"].includes(status)) {
    return paymentRef ? "completed" : "completed";
  }
  if (status === "pending") return "pending";
  if (status === "refunded") return "refunded";
  if (status === "failed") return "failed";
  return status;
}

export async function fetchAdminOrderBoardRows(
  filters: AdminOrdersBoardFilters = {},
): Promise<AdminOrderBoardRow[]> {
  if (!hasSupabaseConfig()) return [];

  const service = createServiceClient();
  const status = filters.status ?? "all";
  const kind = filters.kind ?? "all";
  const limit = filters.limit ?? 400;
  const q = (filters.q ?? "").trim().toLowerCase();

  const rows: AdminOrderBoardRow[] = [];

  if (kind !== "customer") {
    let itemQuery = service
      .from("wholesale_order_items")
      .select(
        `
        id, recipient_phone, unit_price, line_total, status, supplier_order_code, supplier_status, supplier_error, created_at,
        wholesale_orders!inner (
          id, reference, status, source, payment_provider, payment_reference, supplier, supplier_reference, supplier_status, created_at,
          vendors!inner ( business_name, slug )
        ),
        wholesale_bundles!inner ( id, name, network, data_mb, sku, active )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status !== "all") {
      if (status === "processing") {
        itemQuery = itemQuery.in("status", ["queued", "processing", "pending"]);
      } else if (status === "failed") {
        itemQuery = itemQuery.eq("status", "failed");
      } else if (status === "fulfilled") {
        itemQuery = itemQuery.eq("status", "fulfilled");
      } else if (status === "queued") {
        itemQuery = itemQuery.eq("status", "queued");
      } else {
        itemQuery = itemQuery.eq("status", status);
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
        paymentStatus: paymentStatusForOrder(order.status, order.payment_reference),
        commission: null,
        apiStatus: row.supplier_status ?? order.supplier_status ?? row.status,
        apiSource: order.supplier ?? "skanka5",
        apiReference: order.supplier_reference,
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
      .limit(Math.min(limit, 200));

    if (status !== "all") {
      if (status === "processing") {
        orderQuery = orderQuery.in("status", ["paid", "queued", "processing"]);
      } else {
        orderQuery = orderQuery.eq("status", status as OrderStatus);
      }
    }

    const { data } = await orderQuery;

    const bundleMap = await fetchStorefrontOrderBundlesBatch(
      service,
      (data ?? []).map((raw) => (raw as { bundle_id: string }).bundle_id),
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
        paymentStatus: paymentStatusForOrder(row.status, row.payment_reference),
        commission,
        apiStatus: row.supplier_status ?? row.status,
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
    }
  }

  return rows.sort(
    (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime(),
  );
}
