import { Suspense } from "react";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { fetchBundleById } from "@/lib/data/queries";
import { getMomoDirectConfig } from "@/lib/data/platform-config";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = {
  title: "Checkout — Pay with MoMo or Card",
  description:
    "Complete your DCS ELITE data bundle purchase securely with Mobile Money or card. Instant delivery on MTN, Telecel and AirtelTigo.",
  alternates: { canonical: "/checkout" },
  robots: { index: false, follow: true },
};

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ bundle?: string }>;
}) {
  const { bundle: bundleId } = await searchParams;
  const [bundle, momo] = await Promise.all([
    bundleId ? fetchBundleById(bundleId) : Promise.resolve(null),
    getMomoDirectConfig(),
  ]);

  // Storefront switch is separate from the master MoMo switch, so agent wallet
  // ClaimIt can stay on while customer checkout shows Paystack only.
  const momoDirectEnabled =
    momo.enabled &&
    momo.storefrontEnabled &&
    Boolean(
      bundle && momo.merchantNumbers[bundle.network as keyof typeof momo.merchantNumbers],
    );

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 0% 0%, rgba(34, 211, 238, 0.08), transparent 55%),
            radial-gradient(ellipse 50% 40% at 100% 100%, rgba(20, 184, 166, 0.06), transparent 50%),
            linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)
          `,
        }}
      />

      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-700">
              <Lock className="h-3 w-3" />
              Encrypted checkout
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900 sm:text-3xl">
              Complete your order
            </h1>
            <p className="mt-1 max-w-md text-sm text-muted">
              MoMo or card · Webhook-verified · Instant delivery confirmation
            </p>
          </div>

          <div className="hidden items-center gap-2 text-xs font-medium text-muted sm:flex">
            <StepPill n={1} label="Review" active />
            <span className="text-slate-300">→</span>
            <StepPill n={2} label="Pay" active />
            <span className="text-slate-300">→</span>
            <StepPill n={3} label="Delivered" />
          </div>
        </div>

        <Suspense
          fallback={
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="skeleton h-80 rounded-2xl" />
              <div className="skeleton h-96 rounded-2xl" />
            </div>
          }
        >
          <CheckoutForm
            bundle={bundle}
            momoDirectEnabled={momoDirectEnabled}
            momoMerchantName={momo.merchantName}
          />
        </Suspense>
      </div>
    </div>
  );
}

function StepPill({
  n,
  label,
  active,
}: {
  n: number;
  label: string;
  active?: boolean;
}) {
  return (
    <span
      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
        active ? "bg-white text-foreground shadow-sm ring-1 ring-border" : "text-muted-soft"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
          active ? "bg-gradient-to-br from-cyan-500 to-teal-500 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {n}
      </span>
      {label}
    </span>
  );
}
