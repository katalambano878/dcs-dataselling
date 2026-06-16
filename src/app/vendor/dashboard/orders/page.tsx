import Link from "next/link";
import { Package } from "lucide-react";
import { redirect } from "next/navigation";
import {
  AdminPageIntro,
  AdminPageRoot,
  AdminStatGrid,
  AdminStatTile,
} from "@/components/admin";
import { SetupFeeGate } from "@/components/vendor/setup-fee-gate";
import { VendorOrdersBoard } from "@/components/vendor/vendor-orders-board";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchVendorWholesaleOrders } from "@/lib/payments/wholesale-order";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function fetchCustomerOrders(vendorId: string) {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("orders")
    .select("id, reference, recipient_phone, amount, status, created_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as {
    id: string;
    reference: string;
    recipient_phone: string;
    amount: number;
    status: string;
    created_at: string;
  }[];
}

export default async function VendorOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; ref?: string }>;
}) {
  const vendor = await getCurrentVendor();
  if (!vendor) redirect("/auth/login");

  if (!vendor.setupFeePaidAt) {
    return <SetupFeeGate />;
  }

  const params = await searchParams;
  const [wholesaleOrders, customerOrders] = await Promise.all([
    fetchVendorWholesaleOrders(vendor.id, 200),
    fetchCustomerOrders(vendor.id),
  ]);

  return (
    <AdminPageRoot>
      {params.paid === "1" && (
        <div className="banner-success">
          <span className="banner-icon">
            <Package className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h4>Payment received</h4>
            <p>
              {params.ref ? `Ref ${params.ref} — ` : ""}Your order is queued for fulfilment.
            </p>
          </div>
        </div>
      )}

      <AdminPageIntro
        badge="Order history"
        description="Search by order reference or phone. Filter by type and status."
        meta={`${wholesaleOrders.length} wholesale · ${customerOrders.length} customer orders`}
        actions={
          <Link href="/vendor/dashboard/wholesale" className="susu-btn-gold">
            Place new order
          </Link>
        }
      />

      <AdminStatGrid className="lg:grid-cols-2">
        <AdminStatTile
          icon={<Package className="h-4 w-4" />}
          tone="sky"
          label="Wholesale orders"
          value={String(wholesaleOrders.length)}
        />
        <AdminStatTile
          icon={<Package className="h-4 w-4" />}
          tone="gold"
          label="Customer orders"
          value={String(customerOrders.length)}
        />
      </AdminStatGrid>

      <VendorOrdersBoard wholesaleOrders={wholesaleOrders} customerOrders={customerOrders} />
    </AdminPageRoot>
  );
}
