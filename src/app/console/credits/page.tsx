import { format } from "date-fns";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleCredits } from "@/lib/console/send";
import { formatConsoleData } from "@/lib/console/units";

export const dynamic = "force-dynamic";

export default async function ConsoleCreditsPage() {
  const vendor = await getCurrentVendor();
  const rows = vendor ? await fetchConsoleCredits(vendor.id, 100) : [];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Credit History</h1>
      <p className="text-sm text-muted-foreground">
        Data credits allocated to your console account by {vendor?.businessName ?? "admin"}.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Receiver</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No credits yet — admin will allocate data to your console.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3">{vendor?.businessName ?? "—"}</td>
                  <td className="px-4 py-3 font-medium">{formatConsoleData(row.amountMb)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm")}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.reference}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
