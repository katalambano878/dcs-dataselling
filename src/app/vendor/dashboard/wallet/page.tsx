import Link from "next/link";
import { redirect } from "next/navigation";
import { Wallet } from "lucide-react";
import { AdminPageRoot, AdminSection } from "@/components/admin";
import { AgentWalletView } from "@/components/vendor/agent-wallet-view";
import { WalletTopupSection } from "@/components/vendor/wallet-topup-section";
import { SetupFeeGate } from "@/components/vendor/setup-fee-gate";
import { getCurrentVendor } from "@/lib/auth/session";
import { getMomoDirectConfig } from "@/lib/data/platform-config";
import { fetchVendorWalletLedger, fetchVendorWalletMetrics } from "@/lib/data/vendor-agent";
import { primaryMerchantNumber } from "@/lib/payments/wallet-momo-claim";
import type { WalletTopupMethod } from "@/components/vendor/wallet-topup-panel";

export const dynamic = "force-dynamic";

export default async function VendorWalletPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; method?: string }>;
}) {
  const vendor = await getCurrentVendor();
  if (!vendor) redirect("/auth/login");
  if (!vendor.setupFeePaidAt) return <SetupFeeGate />;

  const params = await searchParams;
  const defaultMethod: WalletTopupMethod =
    params.tab === "paystack" || params.method === "paystack" ? "paystack" : "claimit";

  const [metrics, ledger, momo] = await Promise.all([
    fetchVendorWalletMetrics(vendor.id),
    fetchVendorWalletLedger(vendor.id),
    getMomoDirectConfig(),
  ]);

  const momoConfig = {
    enabled: momo.enabled,
    merchantNumber: primaryMerchantNumber(momo.merchantNumbers),
    merchantName: momo.merchantName || "DCS Elite",
    merchantNumbers: momo.merchantNumbers,
  };

  return (
    <AdminPageRoot className="space-y-4">
      <AdminSection
        title="Top up wallet"
        description="Choose ClaimIt (MoMo, no fees on large amounts) or Paystack (card/MoMo, best for small top-ups)."
        icon={Wallet}
      >
        <WalletTopupSection momoConfig={momoConfig} defaultMethod={defaultMethod} />
      </AdminSection>
      <AgentWalletView metrics={metrics} ledger={ledger} embedded />
    </AdminPageRoot>
  );
}
