import { NextResponse } from "next/server";
import { z } from "zod";
import { getConsoleApiContext, isConsoleApiError } from "@/lib/auth/console-api";
import { fetchConsoleProfileState } from "@/lib/console/profile";
import { sendConsoleBundle } from "@/lib/console/send";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";

const schema = z.object({
  recipient_phone: z.string().min(9).max(20),
  network: z.enum(["mtn", "telecel", "at"]),
  amount_mb: z.number().positive(),
  reference: z.string().max(80).optional(),
  batch_id: z.string().max(80).optional(),
});

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  const profileState = await fetchConsoleProfileState(ctx.userId);
  if (!profileState?.complete) {
    return NextResponse.json(
      { error: "Complete your profile (name and phone) before sending bundles." },
      { status: 403 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const result = await sendConsoleBundle({
    vendorId: ctx.vendorId,
    recipientPhone: body.recipient_phone,
    network: body.network as SupplierNetworkSlug,
    amountMb: body.amount_mb,
    reference: body.reference,
    batchId: body.batch_id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    reference: result.send.reference,
    status: result.send.status,
    amount_mb: result.send.amountMb,
    balance_after_mb: result.send.balanceAfterMb,
  });
}
