import { format } from "date-fns";
import { History } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Badge } from "@/components/ui/badge";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleSends } from "@/lib/console/send";
import { formatConsoleData } from "@/lib/console/units";
import { formatPhone } from "@/lib/format";

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
    <AdminPageRoot>
      <AdminPageIntro
        badge="Send history"
        description="Outbound bundle sends debited from your console data balance."
        meta={`${rows.length} record${rows.length === 1 ? "" : "s"}`}
      />

      <AdminSection title="Transaction History" icon={History}>
        {rows.length === 0 ? (
          <AdminEmptyState
            icon={History}
            title="No transactions yet"
            description="Completed sends will appear here once you dispatch bundles."
          />
        ) : (
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Receiver</AdminTh>
              <AdminTh>Network</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reference</AdminTh>
              <AdminTh>Batch ID</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
                <AdminTr key={row.id}>
                  <AdminTd>{formatPhone(row.recipientPhone)}</AdminTd>
                  <AdminTd>
                    <NetworkBadge network={row.network} size="xs" />
                  </AdminTd>
                  <AdminTd className="font-medium">{formatConsoleData(row.amountMb)}</AdminTd>
                  <AdminTd className="whitespace-nowrap text-white/55">
                    {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm")}
                  </AdminTd>
                  <AdminTd>
                    <Badge variant={STATUS_VARIANT[row.status] ?? "neutral"}>{row.status}</Badge>
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">{row.reference}</AdminTd>
                  <AdminTd className="text-white/55">{row.batchId ?? "—"}</AdminTd>
                </AdminTr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminSection>
    </AdminPageRoot>
  );
}
