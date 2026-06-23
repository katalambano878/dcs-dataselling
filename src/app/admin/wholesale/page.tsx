import { getCurrentProfile } from "@/lib/auth/session";
import { fetchAdminWishlistIds } from "@/lib/data/wishlist";
import { fetchAdminWholesaleCatalogue } from "@/lib/data/wholesale";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { AdminConfigError, AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { WholesaleAdmin } from "./wholesale-admin";

export const dynamic = "force-dynamic";

export default async function AdminWholesalePage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const profile = await getCurrentProfile();
  const [bundles, wishlistIds] = await Promise.all([
    fetchAdminWholesaleCatalogue(),
    profile ? fetchAdminWishlistIds(profile.id) : Promise.resolve([]),
  ]);
  const active = bundles.filter((b) => b.active).length;
  const outOfStock = bundles.length - active;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Supply catalogue"
        description="Set wholesale prices agents pay — they add markup in their own storefront catalogue."
        meta={`${bundles.length} bundles · ${active} in stock${outOfStock > 0 ? ` · ${outOfStock} out of stock` : ""}`}
      />
      <WholesaleAdmin bundles={bundles} wishlistIds={wishlistIds} />
    </AdminPageRoot>
  );
}
