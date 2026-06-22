import { NextResponse, after } from "next/server";
import { z } from "zod";

import { assertAdminApi } from "@/lib/auth/admin-api";
import { smsWalletOrderRefund } from "@/lib/notifications/sms";
import { refundWholesaleItemToWallet } from "@/lib/payments/wallet";
import { hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  kind: z.enum(["wholesale_item"]),
  id: z.string().uuid(),
});

/** Refund a failed wallet-paid wholesale line back to the agent's wallet. */
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

  if (body.kind !== "wholesale_item") {
    return NextResponse.json({ error: "Unsupported order type" }, { status: 400 });
  }

  const result = await refundWholesaleItemToWallet(body.id);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, alreadyRefunded: result.alreadyRefunded ?? false },
      { status: result.alreadyRefunded ? 409 : 400 },
    );
  }

  if (result.notifyPhone) {
    const phone = result.notifyPhone;
    const amount = result.amount;
    const reference = result.reference;
    after(() => smsWalletOrderRefund({ phone, amount, reference, context: { item_id: body.id } }));
  }

  return NextResponse.json({
    ok: true,
    amount: result.amount,
    reference: result.reference,
    notified: Boolean(result.notifyPhone),
  });
}
