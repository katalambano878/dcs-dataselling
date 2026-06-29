import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Toaster } from "sonner";
import { ConsoleShell } from "@/components/console/console-shell";
import { getCurrentProfile, getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { isConsoleStaffRole } from "@/lib/console/admin-access";
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

  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(`/auth/login?next=${encodeURIComponent(loginNext)}`);

  const profile = await getCurrentProfile();
  const vendor = await getCurrentVendor();
  const isStaff = isConsoleStaffRole(profile?.role);

  const businessName = isStaff
    ? profile?.fullName?.trim() ||
      profile?.email?.split("@")[0] ||
      (profile?.role === "ops" ? "Operations" : "Platform Admin")
    : profile?.fullName?.trim() ||
      vendor?.businessName ||
      profile?.email?.split("@")[0] ||
      "Data Console";

  const username = isStaff
    ? profile?.role === "ops"
      ? "ops"
      : "admin"
    : (vendor?.slug ?? profile?.email?.split("@")[0] ?? "agent");

  return (
    <>
      <ConsoleShell
        businessName={businessName}
        username={username}
        onConsoleHost={onConsoleHost}
        isStaff={isStaff}
      >
        <div className="admin-page-content mx-auto max-w-6xl px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
          {children}
        </div>
      </ConsoleShell>
      <Toaster position="top-center" richColors />
    </>
  );
}
