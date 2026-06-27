import { format } from "date-fns";
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
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleCredits } from "@/lib/console/send";
import { formatConsoleData } from "@/lib/console/units";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ConsoleCreditsPage() {
  const vendor = await getCurrentVendor();
  const rows = vendor ? await fetchConsoleCredits(vendor.id, 100) : [];

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Credit allocations"
        description={`Data credits allocated to your console account by ${SITE.name} admin.`}
        meta={`${rows.length} allocation${rows.length === 1 ? "" : "s"}`}
      />

      <AdminSection title="Credit History" icon={Wallet}>
        {rows.length === 0 ? (
          <AdminEmptyState
            icon={Wallet}
            title="No credits yet"
            description="Admin will allocate data to your console when your account is topped up."
          />
        ) : (
          <AdminDataTable minWidth="560px">
            <AdminTableHead>
              <AdminTh>Receiver</AdminTh>
              <AdminTh>Amount</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Reference</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {rows.map((row) => (
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
        )}
      </AdminSection>
    </AdminPageRoot>
  );
}
