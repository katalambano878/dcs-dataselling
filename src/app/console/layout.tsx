import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Activity, History, Send } from "lucide-react";
import { Toaster } from "sonner";
import { ConsoleShell } from "@/components/console/console-shell";
import { getCurrentProfile, getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { SITE } from "@/lib/constants";
import { getConsoleHomePath, isConsoleHost } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  if (!hasSupabaseConfig()) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <p>Console requires database configuration.</p>
      </div>
    );
  }

  const vendor = await getCurrentVendor();
  const host = (await headers()).get("host");
  const onConsoleHost = isConsoleHost(host);
  const loginNext = onConsoleHost ? getConsoleHomePath() : "/console";

  if (!vendor) redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`);

  const profile = await getCurrentProfile();
  const account = await getOrCreateConsoleAccount(vendor.id);
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

  if (!account?.enabled) {
    return shell(
      <div className="admin-empty-state">
        <div className="admin-empty-state-icon is-warning">
          <Send className="h-5 w-5" />
        </div>
        <h3 className="admin-empty-state-title">Console not activated</h3>
        <p className="admin-empty-state-desc">
          Your data console has not been enabled yet. Ask {SITE.name} admin to allocate data credit
          to your account.
        </p>
        <div className="admin-empty-state-action">
          <Link href={SITE.url} className="susu-btn-ghost">
            Go to main agent dashboard
          </Link>
        </div>
      </div>,
    );
  }

  void profile;

  return shell(children);
}
