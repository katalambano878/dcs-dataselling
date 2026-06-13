import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Clock, Package } from "lucide-react";
import { verifyCustomerOrderWithPaystack } from "@/lib/payments/customer-order-paystack";
import { fetchStorefrontOrderBundle } from "@/lib/orders/storefront-listing";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { formatDataAmount, formatGHS, formatPhone } from "@/lib/format";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/lib/constants";
import { ORDER_STATUSES } from "@/lib/constants";

const STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; variant: "success" | "warning" | "danger" | "default" | "neutral" }
> = {
  pending: { label: "Pending Payment", variant: "warning" },
  paid: { label: "Payment Confirmed", variant: "default" },
  queued: { label: "In Queue", variant: "warning" },
  processing: { label: "Processing", variant: "default" },
  fulfilled: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "danger" },
  refunded: { label: "Refunded", variant: "neutral" },
};

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order Receipt",
  description: "DCS ELITE order tracking and receipt.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OrderTrackingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { id } = await params;
  const { ref } = await searchParams;

  if (!hasSupabaseConfig()) notFound();

  const service = createServiceClient();

  if (ref) {
    await verifyCustomerOrderWithPaystack(ref);
  }

  type OrderRow = {
    id: string;
    reference: string;
    recipient_phone: string;
    amount: number;
    status: OrderStatus;
    created_at: string;
    fulfilled_at: string | null;
    bundle_id: string;
    vendor: { business_name: string; slug: string } | null;
  };

  const { data } = await service
    .from("orders")
    .select(
      `
      id,
      reference,
      recipient_phone,
      amount,
      status,
      created_at,
      fulfilled_at,
      bundle_id,
      vendor:vendors!orders_vendor_id_fkey ( business_name, slug )
      `,
    )
    .eq("id", id)
    .maybeSingle();

  const order = data as unknown as OrderRow | null;
  if (!order || !order.vendor) notFound();

  const listingBundle = await fetchStorefrontOrderBundle(service, order.bundle_id);
  if (!listingBundle) notFound();

  const bundle = listingBundle;
  const vendor = order.vendor;

  const status = STATUS_CONFIG[order.status];
  const steps: OrderStatus[] = ["paid", "queued", "processing", "fulfilled"];
  const currentIdx = steps.indexOf(order.status);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-lg">
        <div className="text-center">
          {order.status === "fulfilled" ? (
            <CheckCircle2 className="mx-auto h-14 w-14 text-success" />
          ) : (
            <Clock className="mx-auto h-14 w-14 text-cyan-500" />
          )}
          <h1 className="mt-4 text-2xl font-bold">Order {order.reference}</h1>
          <Badge variant={status.variant} className="mt-2">
            {status.label}
          </Badge>
        </div>

        <div className="card-elevated mt-8 p-5">
          <div className="flex items-start justify-between">
            <div>
              <NetworkBadge network={bundle.network} size="sm" />
              <p className="mt-2 font-bold">{formatDataAmount(bundle.data_mb)}</p>
              <p className="text-sm text-muted">{bundle.name}</p>
            </div>
            <p className="font-bold">{formatGHS(Number(order.amount))}</p>
          </div>
          <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Recipient</dt>
              <dd className="font-medium">{formatPhone(order.recipient_phone)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Vendor</dt>
              <dd className="font-medium">{vendor.business_name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Validity</dt>
              <dd className="font-medium">{bundle.validity_days} days</dd>
            </div>
          </dl>
        </div>

        <div className="card-elevated mt-4 p-5">
          <h2 className="text-sm font-semibold">Fulfilment progress</h2>
          <ol className="mt-4 space-y-4">
            {steps.map((step, i) => {
              const done = currentIdx >= i || order.status === "fulfilled";
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      done ? "bg-success text-white" : "bg-slate-200 text-muted"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className={done ? "font-medium" : "text-muted"}>
                    {STATUS_CONFIG[step].label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" className="flex-1" asChild>
            <Link href="/">Return home</Link>
          </Button>
          <Button variant="ghost" className="flex-1" asChild>
            <Link href="/support">
              <Package className="h-4 w-4" />
              Get Help
            </Link>
          </Button>
        </div>

        <Link
          href="/create-store"
          className="mt-4 block rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 p-5 text-white"
        >
          <p className="text-sm font-bold">Earn from data like this</p>
          <p className="mt-1 text-xs text-white/90">
            Launch your own DCS storefront and sell to your network. Apply in 5 minutes.
          </p>
          <p className="mt-2 text-xs font-semibold">Create Store →</p>
        </Link>
      </div>
    </div>
  );
}

void ORDER_STATUSES;
