"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function SupplierPollRailwayButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  async function poll() {
    try {
      const res = await fetch("/api/admin/supplier/poll-railway", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        polled?: number;
        fulfilled?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Poll failed");
      setLast(
        `Polled ${data.polled ?? 0} · updated ${data.fulfilled ?? 0} · failed ${data.failed ?? 0}`,
      );
      toast.success("Railway status sync complete");
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Poll failed");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void poll()}
        disabled={disabled || pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Poll Railway order status
      </button>
      {last && <p className="text-xs text-muted-foreground">{last}</p>}
    </div>
  );
}
