import { NextResponse } from "next/server";
import { z } from "zod";
import { getConsoleApiContext, isConsoleApiError } from "@/lib/auth/console-api";
import { normalizeConsolePhone } from "@/lib/console/profile";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  businessName: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(20).optional(),
  whatsapp: z.string().trim().max(20).optional(),
});

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (
    !body.fullName &&
    !body.businessName &&
    body.phone === undefined &&
    body.whatsapp === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const service = createServiceClient();

  let normalizedPhone: string | undefined;
  if (body.phone !== undefined) {
    normalizedPhone = normalizeConsolePhone(body.phone) ?? undefined;
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "A valid Ghana phone number is required." },
        { status: 400 },
      );
    }
  }

  if (body.fullName !== undefined || normalizedPhone !== undefined) {
    const profileUpdates: Record<string, string> = {};
    if (body.fullName !== undefined) profileUpdates.full_name = body.fullName;
    if (normalizedPhone !== undefined) profileUpdates.phone = normalizedPhone;

    const { error } = await service.from("profiles").update(profileUpdates).eq("id", ctx.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (body.businessName !== undefined || body.whatsapp !== undefined) {
    const vendorUpdates: Record<string, string | null> = {};
    if (body.businessName !== undefined) vendorUpdates.business_name = body.businessName;
    if (body.whatsapp !== undefined) vendorUpdates.whatsapp_number = body.whatsapp || null;

    const { error } = await service
      .from("vendors")
      .update(vendorUpdates)
      .eq("id", ctx.vendorId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
