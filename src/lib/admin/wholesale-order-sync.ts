import "server-only";
import type { DbClient } from "@/lib/db/client";

/** Reconcile parent wholesale_orders.status from line items after admin bulk edits. */
export async function syncWholesaleOrderFromItems(
  service: DbClient,
  wholesaleOrderId: string,
): Promise<void> {
  const { data: items } = await service
    .from("wholesale_order_items")
    .select("status")
    .eq("wholesale_order_id", wholesaleOrderId);

  if (!items?.length) return;

  const statuses = items.map((i: Record<string, unknown>) => (i as { status: string }).status);
  const now = new Date().toISOString();
  let next: string | null = null;

  if (statuses.every((s: string) => s === "fulfilled")) {
    next = "fulfilled";
  } else if (statuses.some((s: string) => s === "failed")) {
    next = statuses.every((s: string) => s === "failed") ? "failed" : "processing";
  } else if (statuses.some((s: string) => s === "processing")) {
    next = "processing";
  } else if (statuses.every((s: string) => s === "queued")) {
    next = "queued";
  }

  if (!next) return;

  const updates: Record<string, unknown> = { status: next };
  if (next === "fulfilled") updates.fulfilled_at = now;

  await service.from("wholesale_orders").update(updates).eq("id", wholesaleOrderId);
}
