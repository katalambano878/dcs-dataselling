import "server-only";

import { getCurrentVendor } from "@/lib/auth/session";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

/** Normalize a Ghana phone to local 0XXXXXXXXX form, or null if invalid. */
export function normalizeConsolePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits;
  if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
  if (digits.length === 9) return `0${digits}`;
  return null;
}

export function isConsoleProfileComplete(params: {
  fullName: string | null | undefined;
  phone: string | null | undefined;
}): boolean {
  const name = params.fullName?.trim() ?? "";
  const phone = normalizeConsolePhone(params.phone);
  return name.length >= 2 && Boolean(phone);
}

export interface ConsoleProfileState {
  complete: boolean;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  businessName: string | null;
  whatsapp: string | null;
}

export async function fetchConsoleProfileState(userId: string): Promise<ConsoleProfileState | null> {
  if (!hasSupabaseConfig()) return null;
  const service = createServiceClient();

  const { data: profile } = await service
    .from("profiles")
    .select("email, full_name, phone")
    .eq("id", userId)
    .maybeSingle();

  const { data: vendor } = await service
    .from("vendors")
    .select("business_name, whatsapp_number")
    .eq("user_id", userId)
    .maybeSingle();

  const row = profile as { email: string; full_name: string | null; phone: string | null } | null;
  const v = vendor as { business_name: string; whatsapp_number: string | null } | null;

  return {
    email: row?.email ?? null,
    fullName: row?.full_name ?? null,
    phone: row?.phone ?? null,
    businessName: v?.business_name ?? null,
    whatsapp: v?.whatsapp_number ?? null,
    complete: isConsoleProfileComplete({
      fullName: row?.full_name,
      phone: row?.phone,
    }),
  };
}

/** Link signed-in user to a vendor row so console shares the same login as dcselite.com. */
export async function ensureConsoleVendor(userId: string, email: string, fullName: string | null) {
  if (!hasSupabaseConfig()) return null;

  const existing = await getCurrentVendor();
  if (existing) return existing;

  const service = createServiceClient();
  const slug = `agent-${userId.slice(0, 8)}`;
  const businessName = fullName?.trim() || email.split("@")[0] || "Console Agent";

  const { data: inserted, error } = await service
    .from("vendors")
    .insert({
      user_id: userId,
      slug,
      business_name: businessName,
      api_only: true,
      status: "approved",
      verified: false,
      kyc_status: "not_started",
      tier: "starter",
    })
    .select(
      "id, slug, business_name, tagline, status, kyc_status, tier, theme_color, emoji, banner_url, whatsapp_number, momo_number, referral_code, verified, rating, total_orders, fulfilment_minutes, commission_rate, featured, setup_fee_paid_at, api_only, created_at",
    )
    .single();

  if (error || !inserted) return null;

  await service.from("profiles").update({ role: "vendor" }).eq("id", userId).eq("role", "customer");

  await service.from("vendor_console_accounts").upsert(
    { vendor_id: (inserted as { id: string }).id, enabled: false, balance_mb: 0 },
    { onConflict: "vendor_id", ignoreDuplicates: true },
  );

  return getCurrentVendor();
}
