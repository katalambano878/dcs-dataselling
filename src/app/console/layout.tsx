import { redirect } from "next/navigation";
import Link from "next/link";
import { headers } from "next/headers";
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

  if (vendor.status === "suspended" || vendor.status === "rejected") {
    return (
      <ConsoleShell businessName={vendor.businessName} username={vendor.slug} onConsoleHost={onConsoleHost}>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
          <p className="font-semibold text-rose-800">Account not active</p>
          <p className="mt-2 text-sm text-rose-700">Contact support to restore console access.</p>
        </div>
      </ConsoleShell>
    );
  }

  const profile = await getCurrentProfile();
  const account = await getOrCreateConsoleAccount(vendor.id);
  const username = vendor.slug;

  if (!account?.enabled) {
    return (
      <ConsoleShell businessName={vendor.businessName} username={username} onConsoleHost={onConsoleHost}>
        <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="font-semibold text-amber-900">Console not activated</p>
          <p className="mt-2 text-sm text-amber-800">
            Your data console has not been enabled yet. Ask {SITE.name} admin to allocate data credit
            to your account.
          </p>
          <Link href={SITE.url} className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
            Go to main agent dashboard
          </Link>
        </div>
      </ConsoleShell>
    );
  }

  void profile;

  return (
    <ConsoleShell businessName={vendor.businessName} username={username} onConsoleHost={onConsoleHost}>
      {children}
    </ConsoleShell>
  );
}
