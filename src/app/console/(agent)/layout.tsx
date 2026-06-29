import Link from "next/link";
import { Activity, Monitor, Store } from "lucide-react";
import { ConsoleStatusBanners } from "@/components/console/console-status-banners";
import { getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { resolveConsoleAccess } from "@/lib/console/access";
import { fetchConsoleProfileState } from "@/lib/console/profile";
import { SITE } from "@/lib/constants";
import { consoleNavHref, isConsoleHost } from "@/lib/platform/console-host";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function AgentConsoleLayout({ children }: { children: React.ReactNode }) {
  const host = (await headers()).get("host");
  const onConsoleHost = isConsoleHost(host);
  const profileHref = consoleNavHref("profile", onConsoleHost);

  const sessionUser = await getSessionUser();
  const vendor = await getCurrentVendor();
  const access = vendor && sessionUser ? await resolveConsoleAccess(sessionUser.id) : null;
  const profileState = sessionUser ? await fetchConsoleProfileState(sessionUser.id) : null;

  if (!vendor || !access) {
    return (
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Monitor className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Data console not linked</h3>
        <p className="admin-empty-state-desc">
          The data console uses a GB/MB balance separate from the main-site GHS wallet. Use the same
          login once an admin enables your console account, or register as an agent on {SITE.shortName}{" "}
          first.
        </p>
        <div className="admin-empty-state-action flex flex-wrap justify-center gap-2">
          <Link href={`${SITE.url}/create-store`} className="susu-btn-gold inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5" />
            Register on {SITE.shortName}
          </Link>
          <Link href={SITE.url} className="susu-btn-ghost">
            Main site home
          </Link>
        </div>
      </div>
    );
  }

  const { vendor: agent, account } = access;

  if (agent.status === "suspended" || agent.status === "rejected") {
    return (
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Activity className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Account not active</h3>
        <p className="admin-empty-state-desc">Contact support to restore console access.</p>
      </div>
    );
  }

  return (
    <>
      <ConsoleStatusBanners
        profileComplete={profileState?.complete ?? false}
        consoleEnabled={account?.enabled ?? false}
        profileHref={profileHref}
      />
      {children}
    </>
  );
}
