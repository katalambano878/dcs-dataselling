import { getCurrentVendor } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { ConsoleSendForm } from "@/components/console/console-send-form";

export const dynamic = "force-dynamic";

export default async function ConsoleSendPage() {
  const vendor = await getCurrentVendor();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;

  return <ConsoleSendForm balanceMb={account?.balanceMb ?? 0} />;
}
