"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function SupplierPollAdaayaButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<string | null>(null);

  async function poll() {
    try {
      const res = await fetch("/api/admin/supplier/poll-adaaya", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        polled?: number;
        fulfilled?: number;
        failed?: number;
        stillProcessing?: number;
        consoleUpdated?: number;
        error?: string;
      };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Adaaya poll failed");
        return;
      }
      const summary = `Polled ${data.polled ?? 0} · delivered ${data.fulfilled ?? 0} · failed ${data.failed ?? 0} · still ${data.stillProcessing ?? 0}`;
      setLast(summary);
      toast.success(summary);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Adaaya poll failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => void poll()}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-white px-3 text-xs font-semibold text-foreground hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        Poll Adaaya status
      </button>
      {last ? <p className="text-[11px] text-muted">{last}</p> : null}
    </div>
  );
}
