import { z } from "zod";

import { fetchWholesaleCatalogue } from "@/lib/data/wholesale";
import { resolveAgentBuyPrice } from "@/lib/wholesale/tier-pricing";
import { debitVendorWallet, getOrCreateVendorWallet } from "@/lib/payments/wallet";
import {
  createWholesaleOrder,
  markWholesaleOrderPaid,
} from "@/lib/payments/wholesale-order";
import { assertRecipientsNotOnCooldown } from "@/lib/orders/recipient-cooldown";
import { createServiceClient } from "@/lib/supabase/server";

import {
  externalCorsPreflight,
  externalItemStatus,
  externalOrderStatus,
  handleExternalApi,
  normalizeGhanaPhone,
} from "../_lib/respond";

export const dynamic = "force-dynamic";

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(100).default(1),
  mobileNumber: z.string().min(9).max(20),
});

const orderSchema = z.object({
  items: z.array(itemSchema).min(1).max(50),
});

export const POST = handleExternalApi(async ({ ctx, body }) => {
  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: "Invalid request body", status: 400 };
  }

  const catalogue = await fetchWholesaleCatalogue(true);
  const lines: {
    wholesaleBundleId: string;
    recipientPhone: string;
    unitPrice: number;
    quantity: number;
    productName: string;
  }[] = [];

  for (const item of parsed.data.items) {
    const bundle = catalogue.find((b) => b.id === item.productId);
    if (!bundle) {
      return {
        success: false,
        error: `Product not found: ${item.productId}`,
        status: 404,
      };
    }
    const phone = normalizeGhanaPhone(item.mobileNumber);
    if (!phone) {
      return {
        success: false,
        error: `Invalid phone number: ${item.mobileNumber}`,
        status: 400,
      };
    }
    lines.push({
      wholesaleBundleId: bundle.id,
      recipientPhone: phone,
      unitPrice: resolveAgentBuyPrice(bundle, ctx.vendorTier),
      quantity: item.quantity,
      productName: bundle.name,
    });
  }

  const phones = lines.map((l) => l.recipientPhone);
  const cooldown = await assertRecipientsNotOnCooldown(phones);
  if (!cooldown.ok) {
    return { success: false, error: cooldown.message, status: 409 };
  }

  const total = +lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0).toFixed(2);
  const wallet = await getOrCreateVendorWallet(ctx.vendorId);
  if (wallet.balance < total) {
    return {
      success: false,
      error: `Insufficient wallet balance. Required ₵${total.toFixed(2)}, available ₵${wallet.balance.toFixed(2)}`,
      status: 400,
    };
  }

  const order = await createWholesaleOrder({
    vendorId: ctx.vendorId,
    source: lines.length > 1 ? "bulk" : "single",
    items: lines.map((l) => ({
      wholesaleBundleId: l.wholesaleBundleId,
      recipientPhone: l.recipientPhone,
      unitPrice: l.unitPrice,
      quantity: l.quantity,
    })),
  });

  const debited = await debitVendorWallet(
    ctx.vendorId,
    total,
    order.reference,
    `External API order ${order.reference}`,
  );

  if (!debited) {
    const service = createServiceClient();
    await service.from("wholesale_orders").delete().eq("id", order.id);
    return { success: false, error: "Wallet debit failed", status: 409 };
  }

  await markWholesaleOrderPaid(order.reference, "api");
  const service = createServiceClient();
  await service
    .from("wholesale_orders")
    .update({ payment_provider: "wallet" })
    .eq("id", order.id);

  const updatedWallet = await getOrCreateVendorWallet(ctx.vendorId);

  return {
    status: 201,
    message: "Order placed successfully",
    data: {
      orderId: order.id,
      reference: order.reference,
      status: externalOrderStatus("queued"),
      totalPrice: total,
      walletBalanceAfter: updatedWallet.balance,
      items: lines.map((l) => ({
        productName: l.productName,
        mobileNumber: l.recipientPhone,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        status: externalItemStatus("queued"),
      })),
      createdAt: new Date().toISOString(),
    },
  };
});

export function OPTIONS() {
  return externalCorsPreflight();
}
