import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Activity, Monitor, Store } from "lucide-react";
import { Toaster } from "sonner";
import { ConsoleShell } from "@/components/console/console-shell";
import { ConsoleStatusBanners } from "@/components/console/console-status-banners";
import { getCurrentProfile, getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { resolveConsoleAccess } from "@/lib/console/access";
import { fetchConsoleProfileState } from "@/lib/console/profile";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { SITE } from "@/lib/constants";
import { consoleNavHref, getConsoleHomePath, isConsoleHost } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p>Console requires database configuration.</p>
      </div>
    );
  }

  const host = (await headers()).get("host");
  const onConsoleHost = isConsoleHost(host);
  const loginNext = onConsoleHost ? getConsoleHomePath() : "/console";
  const profileHref = consoleNavHref("profile", onConsoleHost);

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`);

  void getCurrentProfile();

  const vendor = await getCurrentVendor();
  const access = vendor ? await resolveConsoleAccess(sessionUser.id) : null;
  const profileState = await fetchConsoleProfileState(sessionUser.id);

  const shell = (content: React.ReactNode, businessName = "Data Console", username = "agent") => (
    <>
      <ConsoleShell businessName={businessName} username={username} onConsoleHost={onConsoleHost}>
        <div className="admin-page-content mx-auto max-w-6xl px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
          {content}
        </div>
      </ConsoleShell>
      <Toaster position="top-center" richColors />
    </>
  );

  if (!vendor || !access) {
    return shell(
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Monitor className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Data console not linked</h3>
        <p className="admin-empty-state-desc">
          The data console (GB balance at console.dcselite.com) is separate from the main-site vendor
          dashboard (GHS wallet and storefront). Use the same login once an admin enables your console
          account, or register as an agent on {SITE.shortName} first.
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
      </div>,
    );
  }

  const { vendor: agent, account } = access;

  if (agent.status === "suspended" || agent.status === "rejected") {
    return shell(
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Activity className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Account not active</h3>
        <p className="admin-empty-state-desc">Contact support to restore console access.</p>
      </div>,
      agent.businessName,
      agent.slug,
    );
  }

  return shell(
    <>
      <ConsoleStatusBanners
        profileComplete={profileState?.complete ?? false}
        consoleEnabled={account?.enabled ?? false}
        profileHref={profileHref}
      />
      {children}
    </>,
    agent.businessName,
    agent.slug,
  );
}
