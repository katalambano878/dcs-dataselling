"use client";

import { useState } from "react";
import { CreditCard, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import type { MomoClaimItConfig } from "@/components/vendor/momo-claimit-panel";
import { MomoClaimItPanel } from "@/components/vendor/momo-claimit-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOPUP_PRESETS = [10, 20, 50, 100, 200, 500];

export type WalletTopupMethod = "paystack" | "claimit";

interface Props {
  momoConfig: MomoClaimItConfig;
  defaultMethod?: WalletTopupMethod;
  compact?: boolean;
  paystackFeePercent?: number;
  onSuccess?: () => void;
}

export function WalletTopupPanel({
  momoConfig,
  defaultMethod = "claimit",
  compact = false,
  paystackFeePercent = 0,
  onSuccess,
}: Props) {
  const [method, setMethod] = useState<WalletTopupMethod>(defaultMethod);
  const [amount, setAmount] = useState("50");
  const [loading, setLoading] = useState(false);

  const feePct = Number.isFinite(paystackFeePercent) && paystackFeePercent > 0 ? paystackFeePercent : 0;
  const baseAmount = Number(amount) || 0;
  const feeAmount = +((baseAmount * feePct) / 100).toFixed(2);
  const grossAmount = +(baseAmount + feeAmount).toFixed(2);

  async function startPaystack() {
    const value = Number(amount);
    if (!value || value < 5) {
      toast.error("Minimum top-up is ₵5");
      return;
    }
    if (value > 50000) {
      toast.error("Maximum top-up is ₵50,000");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/vendor/wallet/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const data = (await res.json()) as { authorizationUrl?: string; error?: string };
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.error ?? "Paystack is unavailable");
      }
      window.location.href = data.authorizationUrl;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start Paystack payment");
      setLoading(false);
    }
  }

  return (
    <div className={cn("space-y-4", compact && "space-y-3")}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMethod("claimit")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            method === "claimit"
              ? "border-amber-500/50 bg-amber-500/15 text-amber-100"
              : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
          )}
        >
          <Smartphone className="h-3.5 w-3.5" />
          ClaimIt
        </button>
        <button
          type="button"
          onClick={() => setMethod("paystack")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
            method === "paystack"
              ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
              : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10",
          )}
        >
          <CreditCard className="h-3.5 w-3.5" />
          Paystack
        </button>
      </div>

      {method === "paystack" ? (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/60">
            Pay with card or MoMo via Paystack. Best for small top-ups (₵10–₵200). Paystack charges
            apply.
          </p>
          {feePct > 0 && baseAmount > 0 ? (
            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/90">
              You pay <span className="font-bold">₵{grossAmount.toFixed(2)}</span> (includes ₵
              {feeAmount.toFixed(2)} Paystack fee · {feePct}%). Your wallet is credited{" "}
              <span className="font-bold">₵{baseAmount.toFixed(2)}</span>.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-1.5">
            {TOPUP_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                  amount === String(preset)
                    ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-100"
                    : "border-white/10 text-white/70 hover:bg-white/10",
                )}
              >
                ₵{preset}
              </button>
            ))}
          </div>
          <label className="block text-xs font-medium text-white/70">
            Amount (₵)
            <input
              type="number"
              min={5}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-[#0f172a] px-3 text-sm font-semibold text-white"
            />
          </label>
          <Button
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 font-bold text-white hover:brightness-105"
            disabled={loading}
            onClick={() => void startPaystack()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Pay with Paystack
              </>
            )}
          </Button>
        </div>
      ) : (
        <MomoClaimItPanel config={momoConfig} onSuccess={onSuccess} showCancel={false} />
      )}
    </div>
  );
}
