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
    <div className="mx-auto max-w-lg space-y-4">
      <h1 className="text-xl font-bold">User Profile</h1>
      <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Business</dt>
          <dd className="font-medium">{vendor?.businessName}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Username</dt>
          <dd className="font-mono">@{vendor?.slug}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Email</dt>
          <dd>{profile?.email}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Phone</dt>
          <dd>{phone === "—" ? phone : formatPhone(phone)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Console balance</dt>
          <dd className="font-semibold text-blue-700">{formatConsoleData(account?.balanceMb ?? 0)}</dd>
        </div>
        <div className="flex justify-between px-4 py-3 text-sm">
          <dt className="text-muted-foreground">Main wallet</dt>
          <dd>
            <a href={`${SITE.url}/vendor/dashboard/wallet`} className="text-blue-600 hover:underline">
              Open GHS wallet on {SITE.shortName}
            </a>
          </dd>
        </div>
      </dl>
    </div>
  );
}
