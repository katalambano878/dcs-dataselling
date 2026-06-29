"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminSection } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Props {
  initialKeys: ApiKey[];
}

export function ConsoleApiPanel({ initialKeys }: Props) {
  const base = getConsolePublicUrl();
  const [keys, setKeys] = useState(initialKeys);
  const [pending, setPending] = useState(false);
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setPending(true);
    try {
      const res = await fetch("/api/console/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Console API" }),
      });
      const data = (await res.json()) as {
        error?: string;
        key?: ApiKey & { key: string };
      };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      if (data.key) {
        setNewKeyPlain(data.key.key);
        setKeys((prev) => [
          {
            id: data.key!.id,
            name: data.key!.name,
            key_prefix: data.key!.key_prefix,
            active: true,
            last_used_at: null,
            created_at: data.key!.created_at,
          },
          ...prev,
        ]);
        toast.success("API key created — copy it now");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function revoke(keyId: string) {
    setPending(true);
    try {
      const res = await fetch("/api/console/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, active: false } : k)));
      toast.success("Key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <AdminSection title="API keys" icon={Key}>
        <div className="space-y-4 p-4 sm:p-5">
          {newKeyPlain && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
              <p className="text-sm font-semibold text-amber-200">Copy your new key — shown once</p>
              <code className="mt-2 block break-all rounded-lg bg-black/40 p-3 text-xs text-slate-100">
                {newKeyPlain}
              </code>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                variant="secondary"
                onClick={() => void copy(newKeyPlain)}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy key"}
              </Button>
            </div>
          )}

          <Button type="button" disabled={pending} onClick={() => void createKey()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create API key
          </Button>

          {keys.length === 0 ? (
            <p className="text-sm text-white/60">No keys yet. Create one to call the console API.</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{k.name}</p>
                    <p className="font-mono text-xs text-white/55">
                      {k.key_prefix}… · {k.active ? "active" : "revoked"}
                    </p>
                    <p className="text-[11px] text-white/40">
                      Created {format(new Date(k.created_at), "yyyy-MM-dd")}
                      {k.last_used_at
                        ? ` · Last used ${format(new Date(k.last_used_at), "yyyy-MM-dd")}`
                        : ""}
                    </p>
                  </div>
                  {k.active && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => void revoke(k.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminSection>

      <AdminSection title="Endpoints">
        <div className="space-y-4 p-4 sm:p-5 text-sm text-white/80">
          <p className="text-white/55">Base URL: {base}</p>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">Authorization</p>
            <p className="mt-1 text-white/60">
              Send your API key as <code className="text-amber-200">Authorization: Bearer dcs_…</code>
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">GET /api/v1/console/balance</p>
            <p className="mt-1 text-white/60">Returns balance_mb, total_sends, enabled.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">POST /api/v1/console/send</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-black/40 p-3 text-xs text-slate-100">{`{
  "recipient_phone": "0241234567",
  "network": "mtn",
  "amount_mb": 1000,
  "reference": "optional-idempotency-key"
}`}</pre>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <p className="font-semibold text-white">GET /api/v1/console/transactions</p>
            <p className="mt-1 text-white/60">Recent send history for this console account.</p>
          </div>
        </div>
      </AdminSection>
    </div>
  );
}
