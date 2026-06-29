import { redirect } from "next/navigation";
import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleProfileForm } from "@/components/console/console-profile-form";
import { getCurrentProfile, getCurrentVendor, getSessionUser } from "@/lib/auth/session";
import { getOrCreateConsoleAccount } from "@/lib/console/account";
import { fetchConsoleProfileState } from "@/lib/console/profile";

export const dynamic = "force-dynamic";

export default async function ConsoleProfilePage() {
  const sessionUser = await getSessionUser();
  const vendor = await getCurrentVendor();
  const profile = await getCurrentProfile();
  if (!sessionUser || !vendor || !profile) redirect("/auth/login?next=/profile");

  const [account, profileState] = await Promise.all([
    getOrCreateConsoleAccount(vendor.id),
    fetchConsoleProfileState(sessionUser.id),
  ]);

  const displayName = profile.fullName?.trim() || vendor.businessName;
  const phone = profileState?.phone ?? vendor.momoNumber ?? "";

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Console account"
        description="Same login as dcselite.com. This profile is for the data console only — not the vendor dashboard (GHS wallet / storefront)."
        meta={`@${vendor.slug}`}
      />
      <ConsoleProfileForm
        fullName={displayName}
        businessName={vendor.businessName}
        email={profile.email}
        phone={phone}
        whatsapp={profileState?.whatsapp ?? vendor.whatsappNumber ?? ""}
        username={vendor.slug}
        balanceMb={account?.balanceMb ?? 0}
        profileComplete={profileState?.complete ?? false}
      />
    </AdminPageRoot>
  );
}
