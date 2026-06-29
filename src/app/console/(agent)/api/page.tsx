import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleApiPanel } from "@/components/console/console-api-panel";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchVendorApiKeys } from "@/lib/vendor/extras";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function ConsoleApiPage() {
  const vendor = await getCurrentVendor();
  const keys = vendor ? await fetchVendorApiKeys(vendor.id) : [];
  const base = getConsolePublicUrl();

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Developer"
        description="Create API keys and call console endpoints. Debits use your GB/MB balance, not your GHS wallet."
        meta={`Base URL · ${base}`}
      />
      <ConsoleApiPanel initialKeys={keys} />
    </AdminPageRoot>
  );
}
