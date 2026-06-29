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

  // Platform staff keep admin home even when they also have a vendor row (e.g. console testing).
  if (role === "admin" || role === "ops") {
    return getDashboardHome(role);
  }

  const service = createServiceClient();

  const { data: vendor } = await service
    .from("vendors")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (vendor) return "/vendor/dashboard";

  await reconcileUserSetupPayments(userId);

  const paidSetup = await getPaidSetupAwaitingStore(userId);
  if (paidSetup) return "/create-store?resume=1";

  return getDashboardHome(role);
}
