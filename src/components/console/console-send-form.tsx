"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
    <form onSubmit={submit} className="console-card mx-auto max-w-lg space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h1 className="text-lg font-semibold">Send Bundle</h1>
        <p className="text-sm text-muted-foreground">
          Balance: <strong>{formatConsoleData(balanceMb)}</strong> — deduction is in megabytes.
        </p>
      </div>

      <label className="block text-sm font-medium">
        Network
        <select
          className="mt-1 flex h-10 w-full rounded-lg border border-border px-3"
          value={network}
          onChange={(e) => setNetwork(e.target.value as NetworkId)}
        >
          {NETWORKS.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Recipient phone
        <Input
          className="mt-1"
          placeholder="0241234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
          required
        />
      </label>

      <div>
        <p className="text-sm font-medium">Bundle size</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CONSOLE_SEND_SIZES_MB.map((mb) => (
            <button
              key={mb}
              type="button"
              disabled={mb > balanceMb}
              onClick={() => setAmountMb(mb)}
              className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                amountMb === mb
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 hover:border-slate-300 disabled:opacity-40"
              }`}
            >
              {formatConsoleData(mb)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
        <NetworkBadge network={network} size="xs" />
        <span>
          Send <strong>{formatConsoleData(amountMb)}</strong> to {phone || "…"}
        </span>
      </div>

      <Button type="submit" className="w-full" disabled={pending || amountMb > balanceMb || phone.length < 10}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send bundle"}
      </Button>
    </form>
  );
}
