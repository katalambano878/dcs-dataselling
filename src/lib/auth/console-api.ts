import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { VendorTier } from "@/types";

export type ConsoleApiContext = {
  userId: string;
  vendorId: string;
  email: string | undefined;
  tier: VendorTier;
};

/** Authenticated vendor for console routes — same login as main site, no setup-fee gate. */
export async function getConsoleApiContext(): Promise<ConsoleApiContext | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: vendor } = await service
    .from("vendors")
    .select("id, status, tier")
    .eq("user_id", user.id)
    .maybeSingle();

  const v = vendor as { id: string; status: string; tier: VendorTier | null } | null;
  if (!v) {
    return NextResponse.json({ error: "No agent account linked to this login" }, { status: 404 });
  }

  if (v.status === "suspended" || v.status === "rejected") {
    return NextResponse.json({ error: "Account is not active" }, { status: 403 });
  }

  return {
    userId: user.id,
    vendorId: v.id,
    email: user.email,
    tier: v.tier ?? "starter",
  };
}

export function isConsoleApiError(
  ctx: ConsoleApiContext | NextResponse,
): ctx is NextResponse {
  return ctx instanceof NextResponse;
}
