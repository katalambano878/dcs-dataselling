import { NextResponse } from "next/server";
import { z } from "zod";
import { getConsoleApiContext, isConsoleApiError } from "@/lib/auth/console-api";
import {
  createVendorApiKey,
  fetchVendorApiKeys,
  revokeVendorApiKey,
} from "@/lib/vendor/extras";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET() {
  if (!hasSupabaseConfig()) return NextResponse.json({ keys: [] });

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  const keys = await fetchVendorApiKeys(ctx.vendorId);
  return NextResponse.json({ keys });
}

const createSchema = z.object({
  name: z.string().max(60).optional(),
  expires_in_days: z.number().int().min(1).max(365).optional(),
});

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  try {
    const body = createSchema.parse(await request.json().catch(() => ({})));
    const key = await createVendorApiKey(ctx.vendorId, body.name ?? "Console API", {
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

const revokeSchema = z.object({ keyId: z.string().uuid() });

export async function DELETE(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  try {
    const { keyId } = revokeSchema.parse(await request.json());
    await revokeVendorApiKey(ctx.vendorId, keyId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
