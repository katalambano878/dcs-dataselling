"use client";

import { useState, useTransition } from "react";
import { Check, RefreshCw, X, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import type { ManualOrderRow } from "@/lib/data/supplier-logs";
import { formatDataAmount } from "@/lib/format";

const NETWORK_PILL: Record<string, string> = {
  mtn: "bg-amber-400 text-slate-900",
  telecel: "bg-red-500 text-white",
  at: "bg-red-600 text-white",
};

export function AwaitingManualList({ orders }: { orders: ManualOrderRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [noteOpenFor, setNoteOpenFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function resolve(orderId: string, outcome: "fulfilled" | "failed", optionalNote?: string) {
    setBusyId(orderId);
    try {
      const res = await fetch("/api/admin/supplier/manual-resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, outcome, note: optionalNote || undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Could not resolve order");
        return;
      }
      toast.success(
        outcome === "fulfilled"
          ? "Marked fulfilled. Buyer has been SMS'd."
          : "Marked failed. You can refund from the order page.",
      );
      setNoteOpenFor(null);
      setNote("");
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  async function forwardToApi(o: ManualOrderRow) {
    setBusyId(o.id);
    try {
      const res = await fetch("/api/admin/supplier/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: o.scope, orderId: o.dispatchOrderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.error ?? "Could not forward to API");
        return;
      }
      toast.success("Forwarded to supplier API");
      startTransition(() => router.refresh());
    } finally {
      setBusyId(null);
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-white/70 p-6 text-center text-xs text-muted">
        Nothing awaiting manual fulfilment. New paid orders for networks without an
        automated supplier will appear here.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((o) => (
        <li
          key={`${o.scope}-${o.id}`}
          className="rounded-xl border border-border bg-white p-3 text-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                    NETWORK_PILL[o.network] ?? "bg-slate-200 text-slate-800"
                  }`}
                >
                  {o.network}
                </span>
                <span className="num font-bold text-foreground">
                  {formatDataAmount(o.dataMb)}
                </span>
                <span className="text-xs text-muted">{o.bundleName}</span>
                {o.scope === "wholesale_order" ? (
                  <span className="text-[10px] font-semibold uppercase text-muted">Wholesale</span>
                ) : null}
              </div>
              <p className="mt-1 font-mono text-xs text-muted">
                {o.reference} · → {o.recipientPhone}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {formatDistanceToNow(new Date(o.createdAt), { addSuffix: true })}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={pending || busyId === o.id}
                onClick={() => void forwardToApi(o)}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Forward to API
              </button>
              {o.scope === "customer_order" ? (
                <>
                  <button
                    type="button"
                    disabled={pending || busyId === o.id}
                    onClick={() => resolve(o.id, "fulfilled")}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Fulfilled
                  </button>
                  <button
                    type="button"
                    disabled={pending || busyId === o.id}
                    onClick={() =>
                      setNoteOpenFor((id) => (id === o.id ? null : o.id))
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-white px-2.5 text-xs font-semibold text-foreground hover:bg-slate-50 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Failed
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {noteOpenFor === o.id && o.scope === "customer_order" && (
            <div className="mt-3 rounded-lg border border-border bg-slate-50 p-3">
              <label className="block text-[11px] font-semibold text-muted">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Reason (optional, stored in supplier_logs)
                </span>
              </label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Supplier had no stock"
                className="mt-1 w-full rounded-md border border-border bg-white px-2 py-1.5 text-xs"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNoteOpenFor(null);
                    setNote("");
                  }}
                  className="rounded-md px-2 py-1 text-xs text-muted hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => resolve(o.id, "failed", note)}
                  className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Confirm failed
                </button>
              </div>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
