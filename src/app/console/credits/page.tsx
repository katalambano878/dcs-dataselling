import Link from "next/link";
import { Wallet } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleCreditsPaginated } from "@/lib/console/send";
import { formatConsoleData } from "@/lib/console/units";
import { format } from "date-fns";
import { SITE } from "@/lib/constants";
import { consoleNavHref, isConsoleHost } from "@/lib/platform/console-host";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ConsoleCreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const vendor = await getCurrentVendor();
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);

  const result = vendor
    ? await fetchConsoleCreditsPaginated(vendor.id, { page, pageSize: 20 })
    : { rows: [], total: 0, page: 1, pageSize: 20 };

  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const base = consoleNavHref("credits", onConsole);

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Credit allocations"
        description={`Data credits allocated to your console account by ${SITE.name} admin.`}
        meta={`${result.total} allocation${result.total === 1 ? "" : "s"}`}
      />

      <AdminSection title="Credit History" icon={Wallet}>
        {result.rows.length === 0 ? (
          <AdminEmptyState
            icon={Wallet}
            title="No credits yet"
            description="Admin will allocate data to your console when your account is topped up."
          />
        ) : (
          <>
            <AdminDataTable minWidth="560px">
              <AdminTableHead>
                <AdminTh>Receiver</AdminTh>
                <AdminTh>Amount</AdminTh>
                <AdminTh>Date</AdminTh>
                <AdminTh>Reference</AdminTh>
              </AdminTableHead>
              <AdminTableBody>
                {result.rows.map((row) => (
                  <AdminTr key={row.id}>
                    <AdminTd>{vendor?.businessName ?? "—"}</AdminTd>
                    <AdminTd className="font-medium">{formatConsoleData(row.amountMb)}</AdminTd>
                    <AdminTd className="whitespace-nowrap text-white/55">
                      {format(new Date(row.createdAt), "yyyy-MM-dd HH:mm")}
                    </AdminTd>
                    <AdminTd className="font-mono text-xs">{row.reference}</AdminTd>
                  </AdminTr>
                ))}
              </AdminTableBody>
            </AdminDataTable>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
                <p className="text-xs text-white/50">
                  Page {result.page} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="secondary" disabled={result.page <= 1}>
                    <Link href={result.page <= 1 ? base : `${base}?page=${result.page - 1}`}>
                      Previous
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="secondary" disabled={result.page >= totalPages}>
                    <Link
                      href={
                        result.page >= totalPages ? base : `${base}?page=${result.page + 1}`
                      }
                    >
                      Next
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </AdminSection>
    </AdminPageRoot>
  );
}
