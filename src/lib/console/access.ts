import "server-only";

import { getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount, type VendorConsoleAccount } from "@/lib/console/account";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export type ConsoleAgent = NonNullable<Awaited<ReturnType<typeof getCurrentVendor>>>;

export interface ConsoleAccess {
  vendor: ConsoleAgent;
  account: VendorConsoleAccount | null;
}

/**
 * Resolve the signed-in user's data-console agent record.
 * The data console is separate from the main-site vendor dashboard (GHS wallet / storefront).
 * Same login credentials — different product.
 */
export async function resolveConsoleAccess(userId: string): Promise<ConsoleAccess | null> {
  if (!hasSupabaseConfig()) return null;

  const vendor = await getCurrentVendor();
  if (!vendor || vendor.status === "suspended" || vendor.status === "rejected") return null;

  const account = await getOrCreateConsoleAccount(vendor.id);
  return { vendor, account };
}

/** True when this user runs a main-site store (not console-only). */
export async function isMainSiteStoreVendor(userId: string): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  const service = createServiceClient();
  const { data } = await service
    .from("vendors")
    .select("api_only, setup_fee_paid_at")
    .eq("user_id", userId)
    .maybeSingle();

  const row = data as { api_only: boolean | null; setup_fee_paid_at: string | null } | null;
  if (!row) return false;
  return Boolean(row.setup_fee_paid_at) || !row.api_only;
}
