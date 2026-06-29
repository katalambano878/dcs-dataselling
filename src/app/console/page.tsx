import Link from "next/link";
import { headers } from "next/headers";
import { Activity, History, Send } from "lucide-react";
import { AdminPageRoot, AdminStatGrid, AdminStatTile } from "@/components/admin";
import { getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { fetchConsoleProfileState } from "@/lib/console/profile";
import { consoleNavHref, isConsoleHost } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function ConsoleDashboardPage() {
  const vendor = await getCurrentVendor();
  const sessionUser = await getSessionUser();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;
  const profileState = sessionUser ? await fetchConsoleProfileState(sessionUser.id) : null;
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);
  const sendHref = consoleNavHref("send", onConsole);
  const transactionsHref = consoleNavHref("transactions", onConsole);
  const profileHref = consoleNavHref("profile", onConsole);

  const profileComplete = profileState?.complete ?? false;
  const consoleEnabled = account?.enabled ?? false;
  const canSend = profileComplete && consoleEnabled;

  const statusBadge = !profileComplete
    ? "Complete profile"
    : !consoleEnabled
      ? "Awaiting credit"
      : "Console active";

  const statusHint = !profileComplete
    ? "Update your name and phone under User Profile, then wait for admin to allocate GB."
    : !consoleEnabled
      ? "Your login works on both sites. Admin allocates data credit from Admin → Data Consoles."
      : "Send bundles from your allocated data balance. Separate from the main-site GHS wallet.";

  return (
    <AdminPageRoot>
      <section className="welcome-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="welcome-chip">
              <span className="chip-badge">Data console</span>
              <span className="live-badge">{statusBadge}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 sm:text-[13px]">
              {statusHint} This is the data console — not the vendor dashboard on dcselite.com.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!profileComplete ? (
              <Link href={profileHref} className="susu-btn-gold inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Complete profile
              </Link>
            ) : canSend ? (
              <Link href={sendHref} className="susu-btn-gold inline-flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                Send bundle
              </Link>
            ) : null}
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
