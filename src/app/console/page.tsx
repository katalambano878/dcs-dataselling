import { getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { formatConsoleData } from "@/lib/console/units";

export const dynamic = "force-dynamic";

export default async function ConsoleDashboardPage() {
  const vendor = await getCurrentVendor();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome back! 👋</h1>
        <p className="text-muted-foreground">
          Good to see you today. Send bundles from your data balance below.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Bundle left</p>
          <p className="mt-2 text-3xl font-bold text-blue-700">
            {formatConsoleData(account?.balanceMb ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Transactions made</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{account?.totalSends ?? 0}</p>
        </div>
      </div>
    </div>
  );
}
