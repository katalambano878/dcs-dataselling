"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { NetworkId } from "@/lib/constants";
import { formatGHS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOPUP_PRESETS = [50, 100, 200, 500];

export interface MomoClaimItConfig {
  enabled: boolean;
  merchantNumber: string;
  merchantName: string;
  merchantNumbers: Record<NetworkId, string>;
}

interface Props {
  config: MomoClaimItConfig;
  onSuccess?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

export function MomoClaimItPanel({
  config,
  onSuccess,
  onCancel,
  showCancel = true,
}: Props) {
  const router = useRouter();
  const [amount, setAmount] = useState("100");
  const [paymentCode, setPaymentCode] = useState<string | null>(null);
  const [generatedAmount, setGeneratedAmount] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [txnId, setTxnId] = useState("");
  const [claiming, setClaiming] = useState(false);

  if (!config.enabled || !config.merchantNumber) {
    return (
      <p className="claimit-muted text-sm">
        MoMo ClaimIt is not available yet. Ask your admin to enable MoMo direct payments and set
        merchant numbers in settings.
      </p>
    );
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy");
    }
  }

  async function generateCode() {
    const value = Number(amount);
    if (!value || value < 5) {
      toast.error("Minimum top-up is ₵5");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/vendor/wallet/momo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not generate code");
      setPaymentCode(data.reference);
      setGeneratedAmount(Number(data.amount));
      toast.success("Payment code ready — send MoMo with this reference");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate code");
    } finally {
      setGenerating(false);
    }
  }

  async function claimManually() {
    const trimmed = txnId.trim();
    if (trimmed.length < 4) {
      toast.error("Enter your transaction ID from the MoMo SMS");
      return;
    }
    setClaiming(true);
    try {
      const res = await fetch("/api/vendor/wallet/momo/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId: trimmed,
          reference: paymentCode ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Claim failed");

      if (data.status === "paid") {
        toast.success(`${formatGHS(data.amount)} credited to your wallet`);
        setTxnId("");
        setPaymentCode(null);
        setGeneratedAmount(null);
        onSuccess?.();
        router.refresh();
        return;
      }
      if (data.status === "waiting") {
        toast.message("Payment not found yet — try again in a minute");
        return;
      }
      if (data.status === "already_processed") {
        toast.error("This transaction was already claimed");
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  return (
    <div className="claimit-panel space-y-4">
      <p className="claimit-body text-sm">
        Send payment to{" "}
        <button
          type="button"
          onClick={() => void copyText(config.merchantNumber, "Merchant number")}
          className="claimit-accent font-bold underline-offset-2 hover:underline"
        >
          {config.merchantNumber}
        </button>{" "}
        registered under <strong className="claimit-strong">{config.merchantName}</strong>.
      </p>

      <div className="claimit-instant-box space-y-3 rounded-xl p-4">
        <div className="flex items-center gap-2">
          <Clock className="claimit-accent h-4 w-4" />
          <p className="claimit-accent text-sm font-bold">Instant Top-Up</p>
        </div>
        <p className="claimit-muted text-xs leading-relaxed">
          Generate a unique code. When you send MoMo with this code as reference, your wallet is
          credited automatically. You are always credited the amount shown in your MoMo SMS — even
          if it differs from the amount you enter below.
        </p>

        <div className="flex flex-wrap gap-2">
          {TOPUP_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={cn(
                "claimit-preset rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                amount === String(preset) && "is-active",
              )}
            >
              {formatGHS(preset)}
            </button>
          ))}
        </div>

        <label className="claimit-label block text-[11px] font-bold uppercase tracking-wide">
          Amount (GHS)
        </label>
        <input
          type="number"
          min={5}
          max={50000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="claimit-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm font-semibold"
        />

        {paymentCode ? (
          <div className="claimit-code-box space-y-2 rounded-xl p-3">
            <p className="claimit-label text-[10px] font-bold uppercase tracking-wider">
              Your payment code
            </p>
            <div className="flex items-center gap-2">
              <p className="claimit-accent num flex-1 text-lg font-bold tracking-wider">{paymentCode}</p>
              <button
                type="button"
                onClick={() => void copyText(paymentCode, "Payment code")}
                className="claimit-copy-btn flex h-9 w-9 items-center justify-center rounded-lg"
                aria-label="Copy payment code"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <p className="claimit-muted text-xs">
              Send <strong className="claimit-strong">{formatGHS(generatedAmount ?? Number(amount))}</strong>{" "}
              and use <strong className="claimit-accent">{paymentCode}</strong> as the reference/memo.
            </p>
          </div>
        ) : null}

        <Button
          className="claimit-primary-btn mt-1 w-full"
          disabled={generating}
          onClick={() => void generateCode()}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate Payment Code"}
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="claimit-divider h-px flex-1" />
        <span className="claimit-label text-[10px] font-bold uppercase tracking-[0.2em]">
          Or claim manually
        </span>
        <div className="claimit-divider h-px flex-1" />
      </div>

      <div>
        <label className="claimit-label text-[11px] font-bold uppercase tracking-wide">
          Transaction ID <span className="text-rose-400">*</span>
        </label>
        <input
          type="text"
          placeholder="Enter Transaction ID from SMS"
          value={txnId}
          onChange={(e) => setTxnId(e.target.value)}
          className="claimit-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm font-semibold uppercase tracking-wide placeholder:normal-case placeholder:tracking-normal"
        />
      </div>

      <div className="flex gap-2">
        {showCancel ? (
          <Button type="button" variant="secondary" className="claimit-secondary-btn flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          type="button"
          className={cn("claimit-primary-btn", showCancel ? "flex-1" : "w-full")}
          disabled={claiming || !txnId.trim()}
          onClick={() => void claimManually()}
        >
          {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </Button>
      </div>
    </div>
  );
}
