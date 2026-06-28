import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Activity } from "lucide-react";
import { Toaster } from "sonner";
import { ConsoleShell } from "@/components/console/console-shell";
import { ConsoleStatusBanners } from "@/components/console/console-status-banners";
import { getCurrentProfile, getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { ensureConsoleVendor, fetchConsoleProfileState } from "@/lib/console/profile";
import { hasSupabaseConfig } from "@/lib/supabase/server";
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

  const profile = await getCurrentProfile();
  let vendor = await getCurrentVendor();
  if (!vendor) {
    vendor = await ensureConsoleVendor(
      sessionUser.id,
      profile?.email ?? sessionUser.email ?? "",
      profile?.fullName ?? null,
    );
  }
  if (!vendor) redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`);

  const account = await getOrCreateConsoleAccount(vendor.id);
  const profileState = await fetchConsoleProfileState(sessionUser.id);
  const username = vendor.slug;

  const shell = (content: React.ReactNode) => (
    <>
      <ConsoleShell businessName={vendor.businessName} username={username} onConsoleHost={onConsoleHost}>
        <div className="admin-page-content mx-auto max-w-6xl px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
          {content}
        </div>
      </ConsoleShell>
      <Toaster position="top-center" richColors />
    </>
  );

  if (vendor.status === "suspended" || vendor.status === "rejected") {
    return shell(
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Activity className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Account not active</h3>
        <p className="admin-empty-state-desc">Contact support to restore console access.</p>
      </div>,
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
  );
}
