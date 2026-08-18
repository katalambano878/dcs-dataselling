import "server-only";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export interface SupplierLogRow {
  id: string;
  supplier: string;
  eventType: string;
  scope: string | null;
  reference: string | null;
  supplierReference: string | null;
  httpStatus: number | null;
  ok: boolean | null;
  error: string | null;
  requestPayload: unknown;
  responsePayload: unknown;
  createdAt: string;
}

export interface SupplierLogSummary {
  total: number;
  last24h: {
    submits: number;
    submitFailures: number;
    webhooks: number;
    statusPolls: number;
  };
  pendingDispatch: number; // customer orders queued but never submitted
  failedSupplier: number; // orders/wholesale_orders with supplier_status=failed
  awaitingManual: number; // orders waiting for human fulfilment (no automated supplier)
}

export async function fetchSupplierLogs(limit = 100): Promise<SupplierLogRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data, error } = await service
    .from("supplier_logs")
    .select(
      "id, supplier, event_type, scope, reference, supplier_reference, http_status, ok, error, request_payload, response_payload, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) {
    console.error("[fetchSupplierLogs]", error);
    return [];
  }

  interface Raw {
    id: string;
    supplier: string;
    event_type: string;
    scope: string | null;
    reference: string | null;
    supplier_reference: string | null;
    http_status: number | null;
    ok: boolean | null;
    error: string | null;
    request_payload: unknown;
    response_payload: unknown;
    created_at: string;
  }

  return (data as Raw[]).map((row) => ({
    id: row.id,
    supplier: row.supplier,
    eventType: row.event_type,
    scope: row.scope,
    reference: row.reference,
    supplierReference: row.supplier_reference,
    httpStatus: row.http_status,
    ok: row.ok,
    error: row.error,
    requestPayload: row.request_payload,
    responsePayload: row.response_payload,
    createdAt: row.created_at,
  }));
}

export async function fetchSupplierSummary(): Promise<SupplierLogSummary> {
  const empty: SupplierLogSummary = {
    total: 0,
    last24h: { submits: 0, submitFailures: 0, webhooks: 0, statusPolls: 0 },
    pendingDispatch: 0,
    failedSupplier: 0,
    awaitingManual: 0,
  };
  if (!hasSupabaseConfig()) return empty;
  const service = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: total },
    recentRes,
    pendingRes,
    failedRes,
    failedWholesaleRes,
    manualOrdersRes,
    manualItemsRes,
  ] = await Promise.all([
    service.from("supplier_logs").select("*", { count: "exact", head: true }),
    service.from("supplier_logs").select("event_type, ok").gte("created_at", since),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .is("supplier_reference", null)
      .is("supplier_status", null),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("supplier_status", "failed"),
    service
      .from("wholesale_orders")
      .select("id", { count: "exact", head: true })
      .eq("supplier_status", "failed"),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("supplier_status", "awaiting_manual"),
    service
      .from("wholesale_order_items")
      .select("id", { count: "exact", head: true })
      .eq("supplier_status", "awaiting_manual"),
  ]);

  const rows = (recentRes.data ?? []) as { event_type: string; ok: boolean | null }[];
  let submits = 0;
  let submitFailures = 0;
  let webhooks = 0;
  let statusPolls = 0;
  for (const r of rows) {
    if (r.event_type === "submit_single" || r.event_type === "submit_bulk") {
      submits++;
      if (r.ok === false) submitFailures++;
    } else if (r.event_type === "webhook") webhooks++;
    else if (r.event_type === "status_poll") statusPolls++;
  }

  return {
    total: total ?? 0,
    last24h: { submits, submitFailures, webhooks, statusPolls },
    pendingDispatch: pendingRes.count ?? 0,
    failedSupplier: (failedRes.count ?? 0) + (failedWholesaleRes.count ?? 0),
    awaitingManual: (manualOrdersRes.count ?? 0) + (manualItemsRes.count ?? 0),
  };
}

export interface ManualOrderRow {
  scope: "customer_order" | "wholesale_order";
  id: string;
  /** Parent wholesale order id when scope is wholesale_order (for Forward to API). */
  dispatchOrderId: string;
  reference: string;
  recipientPhone: string;
  network: string;
  dataMb: number;
  bundleName: string;
  supplierId: string | null;
  createdAt: string;
}

export async function fetchAwaitingManualOrders(): Promise<ManualOrderRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();

  const [cust, whs] = await Promise.all([
    service
      .from("orders")
      .select(
        `
      id, reference, recipient_phone, supplier, created_at,
      bundles ( network, data_mb, name )
    `,
      )
      .eq("supplier_status", "awaiting_manual")
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("wholesale_order_items")
      .select(
        `
      id, recipient_phone, created_at, wholesale_order_id,
      wholesale_orders ( reference, supplier ),
      wholesale_bundles ( network, data_mb, name )
    `,
      )
      .eq("supplier_status", "awaiting_manual")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (cust.error) console.error("[fetchAwaitingManualOrders] customer", cust.error);
  if (whs.error) console.error("[fetchAwaitingManualOrders] wholesale", whs.error);

  type CustRow = {
    id: string;
    reference: string;
    recipient_phone: string;
    supplier: string | null;
    created_at: string;
    bundles:
      | { network: string; data_mb: number; name: string }
      | { network: string; data_mb: number; name: string }[]
      | null;
  };

  type WhsRow = {
    id: string;
    recipient_phone: string;
    created_at: string;
    wholesale_order_id: string;
    wholesale_orders:
      | { reference: string; supplier: string | null }
      | { reference: string; supplier: string | null }[]
      | null;
    wholesale_bundles:
      | { network: string; data_mb: number; name: string }
      | { network: string; data_mb: number; name: string }[]
      | null;
  };

  const out: ManualOrderRow[] = [];

  for (const r of (cust.data ?? []) as CustRow[]) {
    const b = Array.isArray(r.bundles) ? r.bundles[0] : r.bundles;
    out.push({
      scope: "customer_order",
      id: r.id,
      dispatchOrderId: r.id,
      reference: r.reference,
      recipientPhone: r.recipient_phone,
      network: b?.network ?? "—",
      dataMb: b?.data_mb ?? 0,
      bundleName: b?.name ?? "—",
      supplierId: r.supplier,
      createdAt: r.created_at,
    });
  }

  for (const r of (whs.data ?? []) as WhsRow[]) {
    const order = Array.isArray(r.wholesale_orders) ? r.wholesale_orders[0] : r.wholesale_orders;
    const b = Array.isArray(r.wholesale_bundles) ? r.wholesale_bundles[0] : r.wholesale_bundles;
    out.push({
      scope: "wholesale_order",
      id: r.id,
      dispatchOrderId: r.wholesale_order_id,
      reference: order?.reference ?? r.id,
      recipientPhone: r.recipient_phone,
      network: b?.network ?? "—",
      dataMb: b?.data_mb ?? 0,
      bundleName: b?.name ?? "—",
      supplierId: order?.supplier ?? null,
      createdAt: r.created_at,
    });
  }

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export interface FailedOrderRow {
  scope: "customer_order" | "wholesale_order";
  id: string;
  reference: string;
  supplierError: string | null;
  createdAt: string;
}

export async function fetchFailedSupplierOrders(): Promise<FailedOrderRow[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();

  type Raw = {
    id: string;
    reference: string;
    supplier_error: string | null;
    created_at: string;
  };

  const [custFailed, custStuck, whs] = await Promise.all([
    service
      .from("orders")
      .select("id, reference, supplier_error, created_at")
      .eq("supplier_status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
    // Paid but never reached the supplier (queued + supplier_error set)
    service
      .from("orders")
      .select("id, reference, supplier_error, created_at")
      .eq("status", "queued")
      .not("supplier_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("wholesale_orders")
      .select("id, reference, supplier_error, created_at")
      .eq("supplier_status", "failed")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const seen = new Set<string>();
  const out: FailedOrderRow[] = [];

  function push(scope: FailedOrderRow["scope"], rows: Raw[]) {
    for (const r of rows) {
      const key = `${scope}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        scope,
        id: r.id,
        reference: r.reference,
        supplierError: r.supplier_error,
        createdAt: r.created_at,
      });
    }
  }

  push("customer_order", (custFailed.data ?? []) as Raw[]);
  push("customer_order", (custStuck.data ?? []) as Raw[]);
  push("wholesale_order", (whs.data ?? []) as Raw[]);

  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
