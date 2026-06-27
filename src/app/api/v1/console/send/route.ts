import { z } from "zod";
import { sendConsoleBundle } from "@/lib/console/send";
import type { SupplierNetworkSlug } from "@/lib/suppliers/types";
import { corsPreflightResponse, handleApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

const schema = z.object({
  recipient_phone: z.string().min(9).max(20),
  network: z.enum(["mtn", "telecel", "at"]),
  amount_mb: z.number().positive(),
  reference: z.string().max(80).optional(),
  batch_id: z.string().max(80).optional(),
});

/** POST /api/v1/console/send — send data from console MB balance. */
export const POST = handleApi(
  async ({ ctx, body }) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        json: { error: "Invalid request", code: "invalid_body", issues: parsed.error.issues },
      };
    }

    const result = await sendConsoleBundle({
      vendorId: ctx.vendorId,
      recipientPhone: parsed.data.recipient_phone,
      network: parsed.data.network as SupplierNetworkSlug,
      amountMb: parsed.data.amount_mb,
      reference: parsed.data.reference,
      batchId: parsed.data.batch_id,
    });

    if (!result.ok) {
      return {
        status: 400,
        json: { error: result.error, code: result.code ?? "send_failed" },
      };
    }

    return {
      json: {
        ok: true,
        reference: result.send.reference,
        status: result.send.status,
        amount_mb: result.send.amountMb,
        balance_after_mb: result.send.balanceAfterMb,
      },
      responseSummary: { reference: result.send.reference, status: result.send.status },
    };
  },
  { method: "POST", endpoint: "/api/v1/console/send" },
);

export function OPTIONS() {
  return corsPreflightResponse();
}
