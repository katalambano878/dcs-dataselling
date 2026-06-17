"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";

export function ExternalApiPollButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function poll() {
    setMessage(null);
    try {
      const res = await fetch("/api/admin/supplier/poll-external", { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        polled?: number;
        fulfilled?: number;
        failed?: number;
      };
      if (!res.ok) throw new Error(data.error ?? "Poll failed");
      setMessage(
        `Polled ${data.polled ?? 0} order(s) · ${data.fulfilled ?? 0} fulfilled · ${data.failed ?? 0} failed`,
      );
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Poll failed");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={poll}
        disabled={disabled || pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold text-foreground transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Poll pending orders
      </button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}
