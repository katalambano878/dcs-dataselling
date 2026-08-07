import { z } from "zod";

import { applyWholesaleOrderExternalStatus } from "@/lib/suppliers/dispatch";
import { corsPreflightResponse, handleApi } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

const schema = z.object({
  status: z.enum([
    "fulfilled",
    "completed",
    "delivered",
    "failed",
    "undelivered",
  ]),
  note: z.string().max(500).optional(),
});

function normalizeOutcome(
  raw: z.infer<typeof schema>["status"],
): "fulfilled" | "failed" {
  if (raw === "failed" || raw === "undelivered") return "failed";
  return "fulfilled";
}

/**
 * POST /api/v1/orders/{reference}/status
 *
 * Old-site callback: when you mark a Telecel/MTN API order delivered or failed
 * on the shop, push that status here so DCS Elite admin/agent boards update.
 */
export const POST = handleApi(
  async ({ ctx, body, params }) => {
    const reference = params.reference;
    if (!reference) {
      return {
        status: 400,
        json: { error: "Reference required", code: "missing_reference" },
      };
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        json: {
          error: "Invalid request",
          code: "invalid_body",
          issues: parsed.error.issues,
        },
      };
    }

    const result = await applyWholesaleOrderExternalStatus({
      vendorId: ctx.vendorId,
      reference,
      outcome: normalizeOutcome(parsed.data.status),
      note: parsed.data.note,
    });

    if (!result.ok) {
      const http =
        result.code === "not_found"
          ? 404
          : result.code === "already_failed" || result.code === "already_fulfilled"
            ? 409
            : 400;
      return {
        status: http,
        json: { error: result.error, code: result.code },
      };
    }

    return {
      json: {
        ok: true,
        reference: result.reference,
        status: result.status,
        already: result.already ?? false,
      },
      responseSummary: {
        reference: result.reference,
        status: result.status,
        already: result.already ?? false,
      },
    };
  },
  { method: "POST", endpoint: "/api/v1/orders/{reference}/status" },
);

export function OPTIONS() {
  return corsPreflightResponse();
}
