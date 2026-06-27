import { fetchAdminConsoleVendors } from "@/lib/data/admin-console";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { AdminConfigError, AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { AdminConsoleBoard } from "./admin-console-board";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default async function AdminConsolesPage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const vendors = await fetchAdminConsoleVendors();
  const active = vendors.filter((v) => v.enabled).length;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Data consoles"
        description="Allocate gigabyte balances to agents for console.dcselite.com — separate from GHS wallet top-ups."
        meta={`${vendors.length} agents · ${active} consoles active · ${getConsolePublicUrl()}`}
      />
      <AdminConsoleBoard vendors={vendors} />
    </AdminPageRoot>
  );
}
