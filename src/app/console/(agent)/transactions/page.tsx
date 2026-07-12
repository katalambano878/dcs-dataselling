import { headers } from "next/headers";
import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleTransactionsTable } from "@/components/console/console-transactions-table";
import { getCurrentVendor } from "@/lib/auth/session";
import {
  fetchConsoleSendsPaginated,
  type ConsoleSendStatusFilter,
} from "@/lib/console/send";
import { isConsoleHost } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

function parseStatus(raw: string | undefined): ConsoleSendStatusFilter {
  if (
    raw === "completed" ||
    raw === "undelivered" ||
    raw === "processing" ||
    raw === "failed"
  ) {
    return raw;
  }
  // Legacy tab URLs
  if (raw === "pending") return "undelivered";
  return "all";
}

export default async function ConsoleTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const status = parseStatus(sp.status);
  const vendor = await getCurrentVendor();
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);

  const result = vendor
    ? await fetchConsoleSendsPaginated(vendor.id, { page, pageSize: 20, status })
    : { rows: [], total: 0, page: 1, pageSize: 20 };

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Send history"
        description="Outbound bundle sends debited from your console data balance."
        meta={`${result.total} record${result.total === 1 ? "" : "s"}`}
      />

      <ConsoleTransactionsTable
        rows={result.rows}
        total={result.total}
        page={result.page}
        pageSize={result.pageSize}
        status={status}
        onConsoleHost={onConsole}
      />
    </AdminPageRoot>
  );
}
