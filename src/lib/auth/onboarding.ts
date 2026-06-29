import "server-only";

import { getDashboardHome } from "@/lib/auth/roles";
import {
  getPaidSetupAwaitingStore,
  reconcileUserSetupPayments,
} from "@/lib/payments/setup-fee";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

/**
 * Decide where to send a user immediately after sign-in.
 * Vendors always land on the dashboard — even if profile.role is still
 * `customer` (can happen if store creation partially succeeded).
 */
export async function getPostLoginRedirect(userId: string, role: UserRole): Promise<string> {
  if (!hasSupabaseConfig()) return getDashboardHome(role);

  // Platform staff use the admin panel — never the vendor dashboard or data console.
  if (role === "admin" || role === "ops") {
    return getDashboardHome(role);
  }

  const service = createServiceClient();

  const { data: vendor } = await service
    .from("vendors")
    .select("id, api_only, setup_fee_paid_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (vendor) {
    const row = vendor as { api_only: boolean | null; setup_fee_paid_at: string | null };
    const isStoreAgent = Boolean(row.setup_fee_paid_at) || !row.api_only;
    // Main-site vendor dashboard only — not the data console (console.dcselite.com).
    if (isStoreAgent) return "/vendor/dashboard";
  }

  await reconcileUserSetupPayments(userId);

  const paidSetup = await getPaidSetupAwaitingStore(userId);
  if (paidSetup) return "/create-store?resume=1";

  return getDashboardHome(role);
}
