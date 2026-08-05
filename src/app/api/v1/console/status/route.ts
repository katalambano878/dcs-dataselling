import { z } from "zod";
import { updateConsoleSendStatus } from "@/lib/console/send";
import { corsPreflightResponse, handleApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

const schema = z.object({
  reference: z.string().min(1).max(80),
  status: z.enum(["completed", "failed", "delivered", "undelivered"]),
  note: z.string().max(500).optional(),
});

function normalizeStatus(raw: z.infer<typeof schema>["status"]): "completed" | "failed" {
  if (raw === "delivered" || raw === "completed") return "completed";
  return "failed";
}

/**
 * POST /api/v1/console/status — old site / telephone callback.
 * Marks a console send delivered or failed after fulfilment on the shop side.
 */
export const POST = handleApi(
  async ({ ctx, body }) => {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        json: { error: "Invalid request", code: "invalid_body", issues: parsed.error.issues },
      };
    }

    const status = normalizeStatus(parsed.data.status);
    const result = await updateConsoleSendStatus({
      vendorId: ctx.vendorId,
      reference: parsed.data.reference,
      status,
      note: parsed.data.note,
    });

    if (!result.ok) {
      const http =
        result.code === "not_found" ? 404 : result.code === "already_failed" ? 409 : 400;
      return {
        status: http,
        json: { error: result.error, code: result.code ?? "status_failed" },
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
  { method: "POST", endpoint: "/api/v1/console/status" },
);

export function OPTIONS() {
  return corsPreflightResponse();
}
