"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { MomoClaimItConfig } from "@/components/vendor/momo-claimit-panel";
import {
  WalletTopupPanel,
  type WalletTopupMethod,
} from "@/components/vendor/wallet-topup-panel";

function TopupSuccessHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    if (searchParams.get("topup") === "1") {
      toast.success("Top-up received — your wallet balance has been updated.");
      router.replace("/vendor/dashboard/wallet", { scroll: false });
    }
  }, [searchParams, router]);

  return null;
}

interface Props {
  momoConfig: MomoClaimItConfig;
  defaultMethod?: WalletTopupMethod;
}

export function WalletTopupSection({ momoConfig, defaultMethod = "claimit" }: Props) {
  return (
    <>
      <Suspense fallback={null}>
        <TopupSuccessHandler />
      </Suspense>
      <WalletTopupPanel momoConfig={momoConfig} defaultMethod={defaultMethod} />
    </>
  );
}
