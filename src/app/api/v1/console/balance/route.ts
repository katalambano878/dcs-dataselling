import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { corsPreflightResponse, handleApi } from "../../_lib/respond";

export const dynamic = "force-dynamic";

/** GET /api/v1/console/balance — data console balance in MB. */
export const GET = handleApi(
  async ({ ctx }) => {
    const account = await getOrCreateConsoleAccount(ctx.vendorId);
    return {
      json: {
        enabled: account?.enabled ?? false,
        balance_mb: account?.balanceMb ?? 0,
        total_sends: account?.totalSends ?? 0,
      },
      responseSummary: { balance_mb: account?.balanceMb ?? 0 },
    };
  },
  { method: "GET", endpoint: "/api/v1/console/balance" },
);

export function OPTIONS() {
  return corsPreflightResponse();
}
