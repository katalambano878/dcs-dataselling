import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  dispatchCustomerOrderToSupplier,
  dispatchWholesaleOrderToSupplier,
} from "@/lib/suppliers/dispatch";

const schema = z.object({
  scope: z.enum(["customer_order", "wholesale_order"]),
  orderId: z.string().uuid(),
});

/**
 * Re-dispatch an order to the currently configured supplier API.
 * Used for:
 *  - failed supplier submissions
 *  - awaiting_manual lines after an API is connected later ("Forward to API")
 */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const service = createServiceClient();

  // Clear supplier state and reset to a dispatchable status so re-push works
  // even after failed / manually-fulfilled / awaiting_manual outcomes.
  if (body.scope === "customer_order") {
    const { data: existing } = await service
      .from("orders")
      .select("id, status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const status = (existing as { status: string }).status;
    const nextStatus = ["paid", "queued", "processing", "failed"].includes(status)
      ? status === "failed"
        ? "queued"
        : status === "paid"
          ? "paid"
          : "queued"
      : null;
    if (!nextStatus) {
      return NextResponse.json(
        { error: `Cannot forward order in status "${status}"` },
        { status: 409 },
      );
    }

    await service
      .from("orders")
      .update({
        status: nextStatus,
        supplier_reference: null,
        supplier_order_code: null,
        supplier_status: null,
        supplier_error: null,
        supplier: null,
      })
      .eq("id", body.orderId);
    await dispatchCustomerOrderToSupplier(body.orderId);
  } else {
    const { data: existing } = await service
      .from("wholesale_orders")
      .select("id, status")
      .eq("id", body.orderId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const status = (existing as { status: string }).status;
    // Allow re-forward from failed / queued / processing / paid; also from
    // fulfilled when supplier never accepted (admin may have marked delivered).
    const nextStatus = ["paid", "queued", "processing", "failed", "fulfilled"].includes(status)
      ? status === "paid"
        ? "paid"
        : "queued"
      : null;
    if (!nextStatus) {
      return NextResponse.json(
        { error: `Cannot forward order in status "${status}"` },
        { status: 409 },
      );
    }

    await service
      .from("wholesale_orders")
      .update({
        status: nextStatus,
        supplier_reference: null,
        supplier_status: null,
        supplier_error: null,
        supplier: null,
      })
      .eq("id", body.orderId);
    await service
      .from("wholesale_order_items")
      .update({
        status: "queued",
        supplier_order_code: null,
        supplier_status: null,
        supplier_error: null,
        supplier_response: null,
        supplier_fulfilled_at: null,
      })
      .eq("wholesale_order_id", body.orderId);
    await dispatchWholesaleOrderToSupplier(body.orderId);
  }

  return NextResponse.json({ ok: true });
}
