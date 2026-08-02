import { fetchAdminConsoleVendors } from "@/lib/data/admin-console";
import { fetchAllConsolePricingTiers } from "@/lib/console/pricing";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { AdminConfigError, AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { AdminConsoleBoard } from "./admin-console-board";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function AdminConsolesPage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const [vendors, tiers] = await Promise.all([
    fetchAdminConsoleVendors(),
    fetchAllConsolePricingTiers(),
  ]);
  const active = vendors.filter((v) => v.enabled).length;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Data consoles"
        description="Allocate GB to store agents for console.dcselite.com. Use API key on each row to connect an old site — sends debit console MB balance, not GHS wallet."
        meta={`${vendors.length} agents · ${active} consoles active · ${getConsolePublicUrl()}`}
      />
      <AdminConsoleBoard vendors={vendors} tiers={tiers} />
    </AdminPageRoot>
  );
}
