import Link from "next/link";
import { format } from "date-fns";
import { History } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ConsoleSendStatusFilter } from "@/lib/console/send";
import type { ConsoleSendRow } from "@/lib/console/send";
import { consoleStatusBadgeVariant, consoleStatusDisplayLabel } from "@/lib/console/status";
import { formatConsoleData } from "@/lib/console/units";
import { formatPhone } from "@/lib/format";
import { consoleNavHref } from "@/lib/platform/console-host";

const TABS: { id: ConsoleSendStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "completed", label: "Delivered" },
  { id: "undelivered", label: "Undelivered" },
  { id: "processing", label: "Processing" },
  { id: "failed", label: "Failed" },
];

interface Props {
  rows: ConsoleSendRow[];
  total: number;
  page: number;
  pageSize: number;
  status: ConsoleSendStatusFilter;
  onConsoleHost: boolean;
}

function pageHref(
  onConsoleHost: boolean,
  page: number,
  status: ConsoleSendStatusFilter,
): string {
  const base = consoleNavHref("transactions", onConsoleHost);
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function ConsoleTransactionsTable({
  rows,
  total,
  page,
  pageSize,
  status,
  onConsoleHost,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <AdminSection title="Transaction History" icon={History}>
      <div className="flex flex-wrap gap-2 border-b border-white/10 px-4 py-3">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={pageHref(onConsoleHost, 1, tab.id)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              status === tab.id
                ? "bg-amber-500/20 text-amber-200"
                : "text-white/55 hover:bg-white/5 hover:text-white"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={History}
          title="No transactions"
          description="No sends match this filter yet."
        />
      ) : (
        <>
          <AdminDataTable>
            <AdminTableHead>
              <AdminTh>Receiver</AdminTh>
              <AdminTh>Network</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Reference</AdminTh>
              <AdminTh>Supplier ref</AdminTh>
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
                    <Badge variant={consoleStatusBadgeVariant(row)}>
                      {consoleStatusDisplayLabel(row)}
                    </Badge>
                    {row.supplierError && (
                      <p className="mt-1 max-w-[200px] truncate text-[11px] text-rose-300">
                        {row.supplierError}
                      </p>
                    )}
                  </AdminTd>
                  <AdminTd className="font-mono text-xs">{row.reference}</AdminTd>
                  <AdminTd className="font-mono text-xs text-white/55">
                    {row.supplierReference ?? "—"}
                  </AdminTd>
                </AdminTr>
              ))}
            </AdminTableBody>
          </AdminDataTable>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
              <p className="text-xs text-white/50">
                Page {page} of {totalPages} · {total} total
              </p>
              <div className="flex gap-2">
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  disabled={page <= 1}
                >
                  <Link href={pageHref(onConsoleHost, page - 1, status)}>Previous</Link>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant="secondary"
                  disabled={page >= totalPages}
                >
                  <Link href={pageHref(onConsoleHost, page + 1, status)}>Next</Link>
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminSection>
  );
}
