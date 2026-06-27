"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, Signal } from "lucide-react";
import { toast } from "sonner";
import { AdminSection } from "@/components/admin";
import { NetworkBadge } from "@/components/marketplace/network-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NETWORKS, type NetworkId } from "@/lib/constants";
import { formatConsoleData, CONSOLE_SEND_SIZES_MB } from "@/lib/console/units";

interface Props {
  balanceMb: number;
}

export function ConsoleSendForm({ balanceMb }: Props) {
  const router = useRouter();
  const [network, setNetwork] = useState<NetworkId>("mtn");
  const [phone, setPhone] = useState("");
  const [amountMb, setAmountMb] = useState<number>(1000);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/console/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ network, recipient_phone: phone, amount_mb: amountMb }),
      });
      const data = (await res.json()) as { error?: string; reference?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success(`Bundle sent — ref ${data.reference ?? ""}`);
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
                onClick={() => setAmountMb(mb)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  amountMb === mb
                    ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                    : "border-white/10 bg-white/5 text-white/80 hover:border-white/20 disabled:opacity-40"
                }`}
              >
                {formatConsoleData(mb)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/80">
          <NetworkBadge network={network} size="xs" />
          <span>
            Send <strong className="text-white">{formatConsoleData(amountMb)}</strong> to{" "}
            {phone || "recipient"}
          </span>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={pending || amountMb > balanceMb || phone.length < 10}
        >
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
