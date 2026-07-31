"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Activity, Loader2 } from "lucide-react";

export function SupplierPingButton({
  disabled,
  supplier = "skanka5",
  label,
}: {
  disabled?: boolean;
  supplier?: "skanka5" | "successbizhub" | "railwayexternal" | "ishare" | "shopdcs";
  label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "ok"; label: string; data: unknown }
    | { kind: "error"; error: string }
  >({ kind: "idle" });

  async function ping() {
    setStatus({ kind: "idle" });
    try {
      const res = await fetch(`/api/admin/supplier/ping?supplier=${supplier}`, {
        method: "POST",
      });
      const data = (await res.json()) as
        | { ok: true; label?: string; data: unknown; networks?: unknown; balance?: unknown; raw?: unknown }
        | { ok: false; error: string };
      if (!res.ok || !("ok" in data) || !data.ok) {
        setStatus({
          kind: "error",
          error: "error" in data ? data.error : "Ping failed",
        });
        return;
      }
      const payload = data.data ?? data.networks ?? data.balance ?? data.raw ?? null;
      setStatus({
        kind: "ok",
        label:
          data.label ??
          (supplier === "successbizhub" ||
          supplier === "ishare" ||
          supplier === "shopdcs"
            ? "Wallet balance"
            : "Networks"),
        data: payload,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setStatus({
        kind: "error",
        error: err instanceof Error ? err.message : "Network error",
      });
    }
  }

  const successTitle =
    supplier === "successbizhub" || supplier === "ishare" || supplier === "shopdcs"
      ? "Connected. Wallet response:"
      : "Connected. Networks returned:";

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={ping}
        disabled={disabled || pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
        {label ??
          (supplier === "successbizhub" || supplier === "ishare" || supplier === "shopdcs"
            ? "Ping wallet balance"
            : "Ping /fetch-networks")}
      </button>

      {status.kind === "ok" && (
        <div className="admin-ping-result is-ok rounded-xl border p-3 text-xs">
          <p className="font-semibold">{successTitle}</p>
          <pre className="admin-ping-result-pre mt-2 max-h-48 overflow-auto rounded-lg p-2 font-mono text-[11px]">
            {formatPingPayload(status.data)}
          </pre>
        </div>
      )}
      {status.kind === "error" && (
        <div className="admin-ping-result is-error rounded-xl border p-3 text-xs">
          <p className="font-semibold">Ping failed</p>
          <p className="mt-1 whitespace-pre-wrap">{status.error}</p>
        </div>
      )}
    </div>
  );
}

function formatPingPayload(data: unknown): string {
  if (data == null) return "(empty response)";
  if (typeof data === "string") return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
