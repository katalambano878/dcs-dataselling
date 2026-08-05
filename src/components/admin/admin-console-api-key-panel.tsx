"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { Check, Copy, Key, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getConsolePublicUrl } from "@/lib/platform/console-host";
import { cn } from "@/lib/utils";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  active: boolean;
  last_used_at: string | null;
  created_at: string;
}

interface Props {
  vendorId: string;
  agentName: string;
  onClose: () => void;
  variant?: "default" | "vault";
}

export function AdminConsoleApiKeyPanel({
  vendorId,
  agentName,
  onClose,
  variant = "default",
}: Props) {
  const vault = variant === "vault";
  const base = getConsolePublicUrl();
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [keyName, setKeyName] = useState("Old site integration");
  const [newKeyPlain, setNewKeyPlain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/console/keys?vendor_id=${vendorId}`);
      const data = (await res.json()) as { keys?: ApiKeyRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load keys");
      setKeys(data.keys ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function createKey() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/console/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: vendorId, name: keyName.trim() || "Console API" }),
      });
      const data = (await res.json()) as {
        error?: string;
        key?: ApiKeyRow & { key: string };
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function revoke(keyId: string) {
    if (!confirm("Revoke this API key? The old site will stop working until a new key is issued.")) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/console/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendor_id: vendorId, key_id: keyId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setKeys((prev) => prev.map((k) => (k.id === keyId ? { ...k, active: false } : k)));
      toast.success("Key revoked");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
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
    <div
      className={cn(
        "mb-4 rounded-xl border p-4",
        vault ? "border-amber-400/30 bg-amber-500/10" : "border-blue-200 bg-blue-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={cn("text-sm font-semibold", vault ? "text-amber-100" : "text-blue-900")}>
            Console API key — {agentName}
          </p>
          <p className={cn("mt-1 text-xs", vault ? "text-white/60" : "text-blue-800")}>
            Issue a key for the old site to call <code>{base}/api/v1/console/send</code> and{" "}
            <code>{base}/api/v1/console/status</code> (when they mark delivered/failed). Debits
            use this agent&apos;s console MB balance (not GHS wallet). For iShare use{" "}
            <code>&quot;network&quot;: &quot;at&quot;</code>.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>

      {newKeyPlain && (
        <div
          className={cn(
            "mt-3 rounded-lg border p-3",
            vault ? "border-amber-400/40 bg-black/30" : "border-amber-300 bg-amber-50",
          )}
        >
          <p className="text-sm font-semibold text-amber-800">Copy now — shown once</p>
          <code className="mt-2 block break-all rounded bg-black/80 p-2 text-xs text-slate-100">
            {newKeyPlain}
          </code>
          <Button type="button" size="sm" className="mt-2" variant="secondary" onClick={() => void copy(newKeyPlain)}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy key"}
          </Button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <label className={cn("text-xs font-medium", vault ? "text-white/70" : "text-blue-900")}>
            Key label
          </label>
          <Input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            className="mt-1 h-9"
            placeholder="Old site integration"
          />
        </div>
        <Button type="button" disabled={pending} onClick={() => void createKey()}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create API key
        </Button>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className={cn("text-sm", vault ? "text-white/50" : "text-muted-foreground")}>
            Loading keys…
          </p>
        ) : keys.length === 0 ? (
          <p className={cn("text-sm", vault ? "text-white/50" : "text-muted-foreground")}>
            No keys yet for this agent.
          </p>
        ) : (
          <ul className="space-y-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                  vault ? "border-white/10 bg-white/5" : "border-border bg-white",
                )}
              >
                <div>
                  <p className={cn("text-sm font-medium", vault ? "text-white" : "text-foreground")}>
                    <Key className="mr-1 inline h-3.5 w-3.5" />
                    {k.name}
                  </p>
                  <p className={cn("font-mono text-xs", vault ? "text-white/55" : "text-muted-foreground")}>
                    {k.key_prefix}… · {k.active ? "active" : "revoked"}
                  </p>
                  <p className={cn("text-[11px]", vault ? "text-white/40" : "text-muted-foreground")}>
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
    </div>
  );
}
