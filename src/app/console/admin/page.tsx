import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { AdminConsoleBoard } from "@/app/admin/consoles/admin-console-board";
import { fetchAllConsolePricingTiers } from "@/lib/console/pricing";
import { fetchAdminConsoleVendors } from "@/lib/data/admin-console";

export const dynamic = "force-dynamic";

export default async function ConsoleAdminPage() {
  const [vendors, tiers] = await Promise.all([
    fetchAdminConsoleVendors(),
    fetchAllConsolePricingTiers(),
  ]);
  const active = vendors.filter((v) => v.enabled).length;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Staff"
        description="Manage agent data consoles — allocate GB, enable accounts, and set pricing tiers."
        meta={`${vendors.length} agents · ${active} active`}
      />
      <AdminConsoleBoard vendors={vendors} tiers={tiers} variant="vault" />
    </AdminPageRoot>
  );
}
