import "server-only";

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
