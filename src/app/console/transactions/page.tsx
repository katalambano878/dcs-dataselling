import { format } from "date-fns";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleSends } from "@/lib/console/send";
import { formatConsoleData } from "@/lib/console/units";
import { formatPhone } from "@/lib/format";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  completed: "success",
  processing: "warning",
  pending: "neutral",
  failed: "danger",
  refunded: "neutral",
};

export default async function ConsoleTransactionsPage() {
  const vendor = await getCurrentVendor();
  const rows = vendor ? await fetchConsoleSends(vendor.id, 100) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Transaction History</h1>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Receiver</th>
              <th className="px-4 py-3">Network</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Batch ID</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  No transactions yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">{formatPhone(row.recipientPhone)}</td>
                  <td className="px-4 py-3">
                    <NetworkBadge network={row.network} size="xs" />
                  </td>
                  <td className="px-4 py-3 font-medium">{formatConsoleData(row.amountMb)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>{row.status}</Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.batchId ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
