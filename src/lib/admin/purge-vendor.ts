import "server-only";

import type { DbClient } from "@/lib/db/client";

const PURGEABLE_STATUSES = new Set(["suspended", "rejected"]);

export async function purgeVendorAccount(
  service: DbClient,
  vendorId: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string; status: number }> {
  const { data: vendor, error: fetchErr } = await service
    .from("vendors")
    .select("id, user_id, status, business_name")
    .eq("id", vendorId)
    .maybeSingle();

  if (fetchErr || !vendor) {
    return { ok: false, error: "Vendor not found", status: 404 };
  }

  const row = vendor as { id: string; user_id: string; status: string; business_name: string };
  if (!PURGEABLE_STATUSES.has(row.status)) {
    return {
      ok: false,
      error: "Only suspended or rejected agents can be deleted. Freeze the account first.",
      status: 409,
    };
  }

  const { error: deleteErr } = await service.from("vendors").delete().eq("id", vendorId);
  if (deleteErr) {
    console.error("[purgeVendorAccount]", deleteErr);
    return {
      ok: false,
      error: deleteErr.message.includes("foreign key")
        ? "Cannot delete — this agent has records that block removal. Contact support."
        : deleteErr.message,
      status: 400,
    };
  }

  await service
    .from("profiles")
    .update({ role: "customer", updated_at: new Date().toISOString() })
    .eq("id", row.user_id);

  await service.from("audit_logs").insert({
    actor_id: null,
    action: "vendor_purged",
    entity_type: "vendor",
    entity_id: vendorId,
    metadata: { business_name: row.business_name, user_id: row.user_id },
  });

  return { ok: true, userId: row.user_id };
}
