import { createServiceClient } from "@/lib/supabase/server";

import {
  externalCorsPreflight,
  externalItemStatus,
  externalOrderStatus,
  handleExternalApi,
} from "../../_lib/respond";

export const dynamic = "force-dynamic";

async function fetchOrderForVendor(vendorId: string, orderId: string) {
  const service = createServiceClient();
  const byId = await service
    .from("wholesale_orders")
    .select(
      `
      id, reference, status, total_amount, created_at,
      wholesale_order_items (
        recipient_phone, quantity, status,
        wholesale_bundles ( name )
      )
    `,
    )
    .eq("vendor_id", vendorId)
    .eq("id", orderId)
    .maybeSingle();

  if (byId.data) return byId.data;

  const byRef = await service
    .from("wholesale_orders")
    .select(
      `
      id, reference, status, total_amount, created_at,
      wholesale_order_items (
        recipient_phone, quantity, status,
        wholesale_bundles ( name )
      )
    `,
    )
    .eq("vendor_id", vendorId)
    .eq("reference", orderId)
    .maybeSingle();

  return byRef.data;
}

type OrderRow = {
  id: string;
  reference: string;
  status: string;
  total_amount: number;
  created_at: string;
  wholesale_order_items:
    | {
        recipient_phone: string;
        quantity: number;
        status: string;
        wholesale_bundles: { name: string } | { name: string }[] | null;
      }[]
    | null;
};

function mapOrder(row: OrderRow) {
  return {
    orderId: row.id,
    reference: row.reference,
    status: externalOrderStatus(row.status),
    totalPrice: Number(row.total_amount),
    createdAt: row.created_at,
    items: (row.wholesale_order_items ?? []).map((it) => {
      const b = Array.isArray(it.wholesale_bundles)
        ? it.wholesale_bundles[0]
        : it.wholesale_bundles;
      return {
        productName: b?.name ?? "Data bundle",
        mobileNumber: it.recipient_phone,
        quantity: it.quantity,
        status: externalItemStatus(it.status),
      };
    }),
  };
}

export const GET = handleExternalApi(async ({ ctx, params }) => {
  const orderId = params.orderId;
  if (!orderId) {
    return { success: false, error: "Order ID required", status: 400 };
  }

  const row = (await fetchOrderForVendor(ctx.vendorId, orderId)) as OrderRow | null;
  if (!row) {
    return { success: false, error: "Order not found", status: 404 };
  }

  return { data: mapOrder(row) };
});

export function OPTIONS() {
  return externalCorsPreflight();
}
