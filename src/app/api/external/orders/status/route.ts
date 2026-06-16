import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";

import {
  externalCorsPreflight,
  externalItemStatus,
  externalOrderStatus,
  handleExternalApi,
} from "../../_lib/respond";

export const dynamic = "force-dynamic";

const schema = z.object({
  orderIds: z.array(z.string().min(1)).min(1).max(50),
});

export const POST = handleExternalApi(async ({ ctx, body }) => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: "Provide orderIds array (max 50)", status: 400 };
  }

  const service = createServiceClient();
  const { data, error } = await service
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
    .eq("vendor_id", ctx.vendorId)
    .in("id", parsed.data.orderIds);

  if (error) {
    return { success: false, error: "Lookup failed", status: 500 };
  }

  type ItemRow = {
    recipient_phone: string;
    quantity: number;
    status: string;
    wholesale_bundles: { name: string } | { name: string }[] | null;
  };
  type Row = {
    id: string;
    reference: string;
    status: string;
    total_amount: number;
    created_at: string;
    wholesale_order_items: ItemRow[] | null;
  };

  const byId = new Map((data as Row[]).map((r) => [r.id, r]));

  const results = parsed.data.orderIds.map((id) => {
    const row = byId.get(id);
    if (!row) {
      return { orderId: id, status: "Cancelled", items: [], error: "Not found" };
    }
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
  });

  return { data: results };
});

export function OPTIONS() {
  return externalCorsPreflight();
}
