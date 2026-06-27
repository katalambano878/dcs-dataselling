import { fetchConsoleSends } from "@/lib/console/send";
import { corsPreflightResponse, handleApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** GET /api/v1/console/transactions — recent console sends. */
export const GET = handleApi(
  async ({ ctx, url }) => {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 50)));
    const rows = await fetchConsoleSends(ctx.vendorId, limit);
    return {
      json: {
        transactions: rows.map((r) => ({
          reference: r.reference,
          recipient_phone: r.recipientPhone,
          network: r.network,
          amount_mb: r.amountMb,
          status: r.status,
          batch_id: r.batchId,
          created_at: r.createdAt,
        })),
      },
      responseSummary: { count: rows.length },
    };
  },
  { method: "GET", endpoint: "/api/v1/console/transactions" },
);

export function OPTIONS() {
  return corsPreflightResponse();
}
