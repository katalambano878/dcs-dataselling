import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import {
  createVendorApiKey,
  fetchVendorApiKeys,
  revokeVendorApiKey,
} from "@/lib/vendor/extras";

const createSchema = z.object({
  vendor_id: z.string().uuid(),
  name: z.string().max(60).optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

const revokeSchema = z.object({
  vendor_id: z.string().uuid(),
  key_id: z.string().uuid(),
});

/** Admin: list console API keys for an agent vendor. */
export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const vendorId = new URL(request.url).searchParams.get("vendor_id")?.trim();
  if (!vendorId) {
    return NextResponse.json({ error: "vendor_id required" }, { status: 400 });
  }

  const keys = await fetchVendorApiKeys(vendorId);
  return NextResponse.json({ keys });
}

/** Admin: create a console API key for an agent (shown once). */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = createSchema.parse(await request.json());
    const key = await createVendorApiKey(body.vendor_id, body.name ?? "Console API", {
      expiresInDays: body.expires_in_days,
    });
    return NextResponse.json({ success: true, key });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create key" },
      { status: 400 },
    );
  }
}

/** Admin: revoke a console API key for an agent. */
export async function DELETE(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { vendor_id, key_id } = revokeSchema.parse(await request.json());
    await revokeVendorApiKey(vendor_id, key_id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
