import Link from "next/link";
import { headers } from "next/headers";
import { Activity, History, Send } from "lucide-react";
import { AdminPageRoot, AdminStatGrid, AdminStatTile } from "@/components/admin";
import { getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { consoleNavHref, isConsoleHost } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function ConsoleDashboardPage() {
  const vendor = await getCurrentVendor();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);
  const sendHref = consoleNavHref("send", onConsole);
  const transactionsHref = consoleNavHref("transactions", onConsole);

  return (
    <AdminPageRoot>
      <section className="welcome-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="welcome-chip">
              <span className="chip-badge">Data console</span>
              <span className="live-badge">Console active</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 sm:text-[13px]">
              Send bundles from your allocated data balance. Separate from the main-site GHS wallet.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href={sendHref} className="susu-btn-gold inline-flex items-center gap-1.5">
              <Send className="h-3.5 w-3.5" />
              Send bundle
            </Link>
            <Link href={transactionsHref} className="susu-btn-ghost inline-flex items-center gap-1.5">
              <History className="h-3.5 w-3.5" />
              View history
            </Link>
          </div>
        </div>
      </section>

      <AdminStatGrid className="max-w-md lg:grid-cols-1">
        <AdminStatTile
          icon={<Activity className="h-4 w-4" />}
          tone="sky"
          label="Transactions made"
          value={String(account?.totalSends ?? 0)}
          hint="Completed console sends"
        />
      </AdminStatGrid>
    </AdminPageRoot>
  );
}
