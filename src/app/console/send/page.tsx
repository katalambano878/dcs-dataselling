import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleSendForm } from "@/components/console/console-send-form";
import { getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";

export const dynamic = "force-dynamic";

export default async function ConsoleSendPage() {
  const vendor = await getCurrentVendor();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Dispatch"
        description="Send data bundles to customers. Each send debits your console balance in megabytes."
      />
      <ConsoleSendForm balanceMb={account?.balanceMb ?? 0} />
    </AdminPageRoot>
  );
}
