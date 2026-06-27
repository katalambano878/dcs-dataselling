import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import { allocateConsoleCredit, setConsoleEnabled } from "@/lib/console/account";
import { gbToMb } from "@/lib/console/units";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("allocate"),
    vendor_id: z.string().uuid(),
    amount_gb: z.number().positive(),
    note: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("toggle"),
    vendor_id: z.string().uuid(),
    enabled: z.boolean(),
  }),
]);

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (body.action === "toggle") {
    const ok = await setConsoleEnabled(body.vendor_id, body.enabled);
    if (!ok) return NextResponse.json({ error: "Failed to update console" }, { status: 400 });
    return NextResponse.json({ ok: true, enabled: body.enabled });
  }

  const amountMb = gbToMb(body.amount_gb);
  const result = await allocateConsoleCredit({
    vendorId: body.vendor_id,
    amountMb,
    note: body.note,
    createdBy: auth.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    amount_mb: result.amountMb,
    amount_gb: body.amount_gb,
    balance_after_mb: result.balanceAfterMb,
    reference: result.reference,
  });
}
