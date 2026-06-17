"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { SITE } from "@/lib/constants";
import type { PlatformConfig } from "@/lib/platform/config-types";

interface Props {
  initialConfig: PlatformConfig;
}

export function PlatformConfigEditor({ initialConfig }: Props) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [pending, setPending] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  async function save() {
    if (
      config.vendorSetupFeeEnabled &&
      (!Number.isFinite(config.vendorSetupFeeGhs) || config.vendorSetupFeeGhs < 1)
    ) {
      toast.error("Setup fee must be at least ₵1 (or turn the fee off)");
      return;
    }

    if (config.momoDirect.enabled) {
      const numbers = config.momoDirect.merchantNumbers;
      const anyConfigured = Object.values(numbers).some((n) => n.trim().length > 0);
      if (!anyConfigured) {
        toast.error("Enable at least one merchant number before turning MoMo direct on");
        return;
      }
      if (!config.momoDirect.smsForwarderSecret) {
        toast.error("Set an SMS-forwarder secret before enabling MoMo direct");
        return;
      }
    }

    setPending(true);
    try {
      const res = await fetch("/api/admin/platform-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = (await res.json()) as { error?: string; config?: PlatformConfig };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (data.config) setConfig(data.config);
      toast.success("Platform settings updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  function generateSecret() {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    const secret = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    setConfig((c) => ({
      ...c,
      momoDirect: { ...c.momoDirect, smsForwarderSecret: secret },
    }));
    setShowSecret(true);
    toast.message("New secret generated — remember to save");
  }

  const momo = config.momoDirect;
  const webhookBase = `${SITE.url.replace(/\/$/, "")}/api/webhooks/momo-sms`;
  const webhookWithSecret = momo.smsForwarderSecret
    ? `${webhookBase}?secret=${encodeURIComponent(momo.smsForwarderSecret)}`
    : webhookBase;
  const jsonBody = `{"from":"{sender-number}","body":"{msg}","timestamp":"{device-time-iso}"}`;

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Vendor store setup fee (GHS)"
          hint={
            config.vendorSetupFeeEnabled
              ? "One-time fee every new agent pays before their store goes live."
              : "Setup fee is turned OFF — new agents create their store for free."
          }
        >
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              step={1}
              value={config.vendorSetupFeeGhs}
              disabled={!config.vendorSetupFeeEnabled}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  vendorSetupFeeGhs: Number(e.target.value),
                }))
              }
              className="admin-form-field-input flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-white/70">
              <input
                type="checkbox"
                checked={config.vendorSetupFeeEnabled}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    vendorSetupFeeEnabled: e.target.checked,
                  }))
                }
                className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-500"
              />
              {config.vendorSetupFeeEnabled ? "On" : "Off"}
            </label>
          </div>
        </Field>
        <Field
          label="Recipient order cooldown (minutes)"
          hint="Block the same phone number from new orders while a recent one is still processing (1–3 min)."
        >
          <input
            type="number"
            min={1}
            max={3}
            step={1}
            value={config.recipientOrderCooldownMinutes}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                recipientOrderCooldownMinutes: Number(e.target.value),
              }))
            }
            className="admin-form-field-input"
          />
        </Field>
        <Field
          label="Referral reward (GHS)"
          hint="Amount credited to the referrer when an invited agent completes their first sale."
        >
          <input
            type="number"
            min={1}
            step={1}
            value={config.referralRewardGhs}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                referralRewardGhs: Number(e.target.value),
              }))
            }
            className="admin-form-field-input"
          />
        </Field>
        <Field
          label="Paystack fee charged to agent (%)"
          hint="Added on top of a wallet top-up so the agent bears Paystack's charge (e.g. 2 → agent pays ₵102 to add ₵100). 0 = DCS absorbs the fee. ClaimIt is never charged."
        >
          <input
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={config.paystackFeePercent}
            onChange={(e) =>
              setConfig((c) => ({
                ...c,
                paystackFeePercent: Number(e.target.value),
              }))
            }
            className="admin-form-field-input"
          />
        </Field>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
              MoMo direct (SMS forwarder)
            </p>
            <p className="mt-0.5 text-xs text-white/55">
              Accept Mobile Money payments by matching forwarded SMS to customer-typed transaction IDs.
              Leave disabled to keep checkout on Paystack only.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-white/70">
            <input
              type="checkbox"
              checked={momo.enabled}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  momoDirect: { ...c.momoDirect, enabled: e.target.checked },
                }))
              }
              className="h-4 w-4 rounded border-white/20 bg-white/5 accent-amber-500"
            />
            {momo.enabled ? "Enabled" : "Disabled"}
          </label>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Merchant name (shown to customers)">
            <input
              type="text"
              value={momo.merchantName}
              placeholder="e.g. DCS ELITE"
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  momoDirect: { ...c.momoDirect, merchantName: e.target.value },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>

          <Field
            label="SMS-forwarder secret"
            hint="Configure the Android forwarder app to send this as Bearer in the Authorization header to /api/webhooks/momo-sms"
          >
            <div className="flex gap-2">
              <input
                type={showSecret ? "text" : "password"}
                value={momo.smsForwarderSecret}
                placeholder="paste or generate"
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    momoDirect: { ...c.momoDirect, smsForwarderSecret: e.target.value },
                  }))
                }
                className="admin-form-field-input flex-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                className="rounded-md border border-white/10 bg-white/5 px-2 text-white/60 hover:bg-white/10"
                aria-label={showSecret ? "Hide secret" : "Show secret"}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={generateSecret}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 text-xs text-white/70 hover:bg-white/10"
              >
                <RefreshCw className="h-3 w-3" />
                Rotate
              </button>
            </div>
          </Field>

          <Field label="MTN merchant number" hint="Number your customers send MTN MoMo to.">
            <input
              type="tel"
              inputMode="tel"
              placeholder="0241234567"
              value={momo.merchantNumbers.mtn}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  momoDirect: {
                    ...c.momoDirect,
                    merchantNumbers: { ...c.momoDirect.merchantNumbers, mtn: e.target.value },
                  },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>

          <Field label="Telecel Cash merchant number">
            <input
              type="tel"
              inputMode="tel"
              placeholder="0201234567"
              value={momo.merchantNumbers.telecel}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  momoDirect: {
                    ...c.momoDirect,
                    merchantNumbers: { ...c.momoDirect.merchantNumbers, telecel: e.target.value },
                  },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>

          <Field label="AT Money merchant number">
            <input
              type="tel"
              inputMode="tel"
              placeholder="0271234567"
              value={momo.merchantNumbers.at}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  momoDirect: {
                    ...c.momoDirect,
                    merchantNumbers: { ...c.momoDirect.merchantNumbers, at: e.target.value },
                  },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>
        </div>

        <div className="mt-4 space-y-3 rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-amber-200">
            SMS forwarder phone setup
          </p>
          <p className="text-[11px] leading-relaxed text-amber-100/90">
            A <strong>401 Unauthorized</strong> error means the phone reached DCS but the secret did not
            match. After generating or changing the secret, click <strong>Save platform settings</strong>{" "}
            below, then update the phone app with the new value.
          </p>

          <SetupRow
            label="Method"
            value="POST"
            onCopy={() => copyText("POST", "HTTP method")}
          />
          <SetupRow
            label="Webhook URL (with secret in URL — easiest)"
            value={webhookWithSecret}
            onCopy={() => copyText(webhookWithSecret, "Webhook URL")}
            mono
          />
          <SetupRow
            label="Webhook URL (headers only — alternative)"
            value={webhookBase}
            onCopy={() => copyText(webhookBase, "Webhook URL")}
            mono
          />
          <SetupRow
            label="Custom header — name"
            value="Authorization"
            onCopy={() => copyText("Authorization", "Header name")}
          />
          <SetupRow
            label="Custom header — value"
            value={
              momo.smsForwarderSecret
                ? `Bearer ${momo.smsForwarderSecret}`
                : "Generate a secret above, save, then copy"
            }
            onCopy={() =>
              momo.smsForwarderSecret
                ? copyText(`Bearer ${momo.smsForwarderSecret}`, "Header value")
                : undefined
            }
            mono
          />
          <SetupRow
            label="JSON body template"
            value={jsonBody}
            onCopy={() => copyText(jsonBody, "JSON body")}
            mono
          />

          <ul className="list-disc space-y-1 pl-4 text-[10px] leading-relaxed text-amber-100/80">
            <li>
              Filter sender to <strong>MobileMoney</strong> (or <strong>*</strong> for all MoMo SMS).
            </li>
            <li>
              If your app has no custom headers, use the <strong>URL with secret</strong> line only.
            </li>
            <li>
              If it supports headers, use the base URL +{" "}
              <code className="rounded bg-black/30 px-1 font-mono">Authorization: Bearer …</code>
            </li>
            <li>Use the app&apos;s <strong>Send test</strong> button after saving — you should get 200, not 401.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300">
          Contact &amp; WhatsApp
        </p>
        <p className="mt-0.5 text-xs text-white/55">
          Powers the floating call, WhatsApp chat, and channel buttons in the vendor dashboard.
          Leave a field blank to hide its button.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="Support WhatsApp / call number"
            hint="The number vendors call or message. Use full Ghana format, e.g. 0241234567."
          >
            <input
              type="tel"
              inputMode="tel"
              placeholder="0241234567"
              value={config.contact.supportWhatsApp}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  contact: { ...c.contact, supportWhatsApp: e.target.value },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>

          <Field
            label="Join WhatsApp channel link"
            hint="Full link from WhatsApp channel → Share. e.g. https://whatsapp.com/channel/xxxx"
          >
            <input
              type="url"
              inputMode="url"
              placeholder="https://whatsapp.com/channel/..."
              value={config.contact.whatsappChannelUrl}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  contact: { ...c.contact, whatsappChannelUrl: e.target.value },
                }))
              }
              className="admin-form-field-input"
            />
          </Field>
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="susu-btn-gold inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save platform settings
      </button>
    </div>
  );
}

function SetupRow({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-black/20 bg-black/20 p-2">
      <p className="text-[10px] font-semibold text-amber-200/90">{label}</p>
      <div className="mt-1 flex items-start gap-2">
        <p
          className={`min-w-0 flex-1 break-all text-[11px] text-white/90 ${mono ? "font-mono" : ""}`}
        >
          {value}
        </p>
        {onCopy && (
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex shrink-0 items-center gap-1 rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/70 hover:bg-white/10"
          >
            <Copy className="h-3 w-3" />
            Copy
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}
