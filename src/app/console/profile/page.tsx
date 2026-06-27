import Link from "next/link";
import { ExternalLink, User } from "lucide-react";
import {
  AdminKvList,
  AdminKvRow,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
} from "@/components/admin";
import { getCurrentProfile, getCurrentVendor } from "@/lib/auth/session";
import { fetchVendorProfilePhone } from "@/lib/data/vendor-profile";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { formatConsoleData } from "@/lib/console/units";
import { formatPhone } from "@/lib/format";
import { SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ConsoleProfilePage() {
  const vendor = await getCurrentVendor();
  const profile = await getCurrentProfile();
  const account = vendor ? await getOrCreateConsoleAccount(vendor.id) : null;
  const profilePhone = profile ? await fetchVendorProfilePhone(profile.id) : null;
  const phone = profilePhone ?? vendor?.momoNumber ?? vendor?.whatsappNumber ?? "—";

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Account"
        description="Your console identity and linked contact details."
        meta={`@${vendor?.slug ?? "agent"}`}
      />

      <AdminSection title="User Profile" icon={User}>
        <AdminKvList>
          <AdminKvRow label="Business" value={vendor?.businessName ?? "—"} />
          <AdminKvRow label="Username" value={`@${vendor?.slug ?? "—"}`} />
          <AdminKvRow label="Email" value={profile?.email ?? "—"} />
          <AdminKvRow
            label="Phone"
            value={phone === "—" ? phone : formatPhone(phone)}
          />
          <AdminKvRow
            label="Console balance"
            value={formatConsoleData(account?.balanceMb ?? 0)}
          />
          <AdminKvRow
            label="Main wallet"
            value={
              <Link
                href={`${SITE.url}/vendor/dashboard/wallet`}
                className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
              >
                Open GHS wallet on {SITE.shortName}
                <ExternalLink className="h-3 w-3" />
              </Link>
            }
          />
        </AdminKvList>
      </AdminSection>
    </AdminPageRoot>
  );
}
