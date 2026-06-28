import Link from "next/link";
import { AlertTriangle, User } from "lucide-react";
import { AdminEmptyState, AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleSendForm } from "@/components/console/console-send-form";
import { getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { fetchConsoleProfileState } from "@/lib/console/profile";
import { consoleNavHref, isConsoleHost } from "@/lib/platform/console-host";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function ConsoleSendPage() {
  const vendor = await getCurrentVendor();
  const sessionUser = await getSessionUser();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;
  const profileState = sessionUser ? await fetchConsoleProfileState(sessionUser.id) : null;
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);
  const profileHref = consoleNavHref("profile", onConsole);

  const profileComplete = profileState?.complete ?? false;
  const consoleEnabled = account?.enabled ?? false;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Dispatch"
        description="Send data bundles to customers. Each send debits your console balance in megabytes."
      />

      {!profileComplete ? (
        <AdminEmptyState
          icon={User}
          title="Complete your profile first"
          description="Add your full name and phone under User Profile before sending bundles."
          action={
            <Link href={profileHref} className="susu-btn-gold inline-flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" />
              Update profile
            </Link>
          }
        />
      ) : !consoleEnabled ? (
        <AdminEmptyState
          icon={AlertTriangle}
          title="Console not activated"
          description="An admin must allocate data credit to your account before you can send bundles."
        />
      ) : (
        <ConsoleSendForm balanceMb={account?.balanceMb ?? 0} />
      )}
    </AdminPageRoot>
  );
}
