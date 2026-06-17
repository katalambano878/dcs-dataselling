import Link from "next/link";
import { redirect } from "next/navigation";
import { Smartphone, Wallet } from "lucide-react";
import { AdminPageIntro, AdminPageRoot, AdminSection } from "@/components/admin";
import { WalletTopupSection } from "@/components/vendor/wallet-topup-section";
import { SetupFeeGate } from "@/components/vendor/setup-fee-gate";
import { getCurrentVendor } from "@/lib/auth/session";
import { getMomoDirectConfig, getPaystackFeePercent } from "@/lib/data/platform-config";
import { primaryMerchantNumber } from "@/lib/payments/wallet-momo-claim";

export const dynamic = "force-dynamic";

export default async function VendorClaimPage() {
  const vendor = await getCurrentVendor();
  if (!vendor) redirect("/auth/login");
  if (!vendor.setupFeePaidAt) return <SetupFeeGate />;

  const [momo, paystackFeePercent] = await Promise.all([
    getMomoDirectConfig(),
    getPaystackFeePercent(),
  ]);

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Wallet top-up"
        description="ClaimIt for large MoMo transfers, or switch to Paystack for quick small top-ups."
        actions={
          <Link href="/vendor/dashboard/wallet?tab=paystack" className="susu-btn-ghost">
            Paystack top-up
          </Link>
        }
      />
      <AdminSection title="ClaimIt or Paystack" icon={Smartphone}>
        <WalletTopupSection
          defaultMethod="claimit"
          paystackFeePercent={paystackFeePercent}
          momoConfig={{
            enabled: momo.enabled,
            merchantNumber: primaryMerchantNumber(momo.merchantNumbers),
            merchantName: momo.merchantName || "DCS Elite",
            merchantNumbers: momo.merchantNumbers,
          }}
        />
      </AdminSection>
      <p className="text-center text-xs text-muted">
        <Link href="/vendor/dashboard/wallet" className="inline-flex items-center gap-1 font-semibold text-cyan-700 hover:underline">
          <Wallet className="h-3.5 w-3.5" />
          View wallet balance & history
        </Link>
      </p>
    </AdminPageRoot>
  );
}
