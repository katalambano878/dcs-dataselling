"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Signal } from "lucide-react";
import { toast } from "sonner";
import { AdminSection } from "@/components/admin";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NETWORKS, type NetworkId } from "@/lib/constants";
import {
  CONSOLE_SEND_SIZES_MB,
  formatConsoleData,
  parseConsoleAmount,
} from "@/lib/console/units";

interface Props {
  balanceMb: number;
}

type SizeMode = "preset" | "custom";

export function ConsoleSendForm({ balanceMb }: Props) {
  const router = useRouter();
  const [network, setNetwork] = useState<NetworkId>("mtn");
  const [phone, setPhone] = useState("");
  const [sizeMode, setSizeMode] = useState<SizeMode>("preset");
  const [amountMb, setAmountMb] = useState<number>(1000);
  const [customValue, setCustomValue] = useState("");
  const [customUnit, setCustomUnit] = useState<"gb" | "mb">("gb");
  const [pending, setPending] = useState(false);

  const customAmountMb = useMemo(
    () => (sizeMode === "custom" ? parseConsoleAmount(customValue, customUnit) : null),
    [sizeMode, customValue, customUnit],
  );

  const effectiveAmountMb = sizeMode === "custom" ? (customAmountMb ?? 0) : amountMb;
  const customInvalid = sizeMode === "custom" && customAmountMb == null && customValue.trim() !== "";
  const canSend =
    effectiveAmountMb > 0 &&
    effectiveAmountMb <= balanceMb &&
    phone.length >= 10 &&
    !customInvalid;

  function selectPreset(mb: number) {
    setSizeMode("preset");
    setAmountMb(mb);
  }

  function updateCustomValue(value: string) {
    setSizeMode("custom");
    setCustomValue(value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;

    setPending(true);
    try {
      const res = await fetch("/api/console/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          network,
          recipient_phone: phone,
          amount_mb: effectiveAmountMb,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reference?: string;
        supplier_reference?: string | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      const refLine = data.supplier_reference
        ? ` — supplier ${data.supplier_reference}`
        : "";
      toast.success(`Bundle sent — ref ${data.reference ?? ""}${refLine}`);
      setPhone("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <AdminSection
      title="Send Bundle"
      description={
        <>
          Available balance: <strong>{formatConsoleData(balanceMb)}</strong>. Deductions are in
          megabytes, not GHS.
        </>
      }
      icon={Send}
    >
      <form onSubmit={submit} className="space-y-4 p-4 sm:p-5">
        <label className="block text-sm font-medium text-slate-200">
          Network
          <select
            className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
            value={network}
            onChange={(e) => setNetwork(e.target.value as NetworkId)}
          >
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id} className="text-slate-900">
                {n.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm font-medium text-slate-200">
          Recipient phone
          <Input
            className="mt-1 border-white/10 bg-white/5 text-white placeholder:text-white/40"
            placeholder="0241234567"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            required
          />
        </label>

        <div>
          <p className="text-sm font-medium text-slate-200">Bundle size</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CONSOLE_SEND_SIZES_MB.map((mb) => (
              <button
                key={mb}
                type="button"
                disabled={mb > balanceMb}
                onClick={() => selectPreset(mb)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  sizeMode === "preset" && amountMb === mb
                    ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 disabled:opacity-40"
                }`}
              >
                {formatConsoleData(mb)}
              </button>
            ))}
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 ${
            sizeMode === "custom"
              ? "border-amber-400/50 bg-amber-500/10"
              : "border-white/10 bg-white/5"
          }`}
        >
          <p className="text-sm font-medium text-slate-200">Custom amount</p>
          <p className="mt-1 text-xs text-white/55">Enter any size in GB or MB.</p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[120px] flex-1 text-sm text-slate-200">
              Amount
              <Input
                type="text"
                inputMode="decimal"
                className="mt-1 border-white/10 bg-black/20 text-white placeholder:text-white/40"
                placeholder={customUnit === "gb" ? "e.g. 1.5" : "e.g. 1500"}
                value={customValue}
                onChange={(e) => updateCustomValue(e.target.value)}
                onFocus={() => setSizeMode("custom")}
              />
            </label>
            <label className="text-sm text-slate-200">
              Unit
              <select
                className="mt-1 flex h-10 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white"
                value={customUnit}
                onChange={(e) => {
                  setSizeMode("custom");
                  setCustomUnit(e.target.value as "gb" | "mb");
                }}
              >
                <option value="gb" className="text-slate-900">
                  GB
                </option>
                <option value="mb" className="text-slate-900">
                  MB
                </option>
              </select>
            </label>
          </div>
          {customInvalid && (
            <p className="mt-2 text-xs text-rose-300">Enter a valid amount greater than zero.</p>
          )}
          {sizeMode === "custom" && customAmountMb != null && customAmountMb > balanceMb && (
            <p className="mt-2 text-xs text-rose-300">
              Exceeds available balance ({formatConsoleData(balanceMb)}).
            </p>
          )}
          {sizeMode === "custom" && customAmountMb != null && customAmountMb <= balanceMb && (
            <p className="mt-2 text-xs text-emerald-300">
              Will send {formatConsoleData(customAmountMb)}.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
          <NetworkBadge network={network} size="xs" />
          <span>
            Send <strong className="text-white">{formatConsoleData(effectiveAmountMb)}</strong> to{" "}
            {phone || "recipient"}
          </span>
        </div>

        <Button type="submit" className="w-full" disabled={pending || !canSend}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Signal className="h-4 w-4" />
              Send bundle
            </>
          )}
        </Button>
      </form>
    </AdminSection>
  );
}
