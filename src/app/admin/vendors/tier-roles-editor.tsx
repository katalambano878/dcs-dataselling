"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { AgentTierSettings } from "@/lib/vendor/tier-settings-types";
import { VENDOR_TIERS } from "@/lib/vendor/tiers";
import type { VendorTier } from "@/types";

interface Props {
  initialSettings: AgentTierSettings;
}

const ROLE_LABELS: Record<VendorTier, string> = {
  starter: "Agent (base role)",
  verified: "Super Agent role",
  pro: "Pro Agent role",
  express: "Express Agent role (supplier price)",
};

export function TierRolesEditor({ initialSettings }: Props) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [pending, setPending] = useState(false);

  function updateRole(tier: VendorTier, field: keyof AgentTierSettings["tiers"]["starter"], value: string) {
    setSettings((prev) => ({
      ...prev,
      tiers: {
        ...prev.tiers,
        [tier]: {
          ...prev.tiers[tier],
          [field]:
            field === "label" || field === "description"
              ? value
              : Number(value),
        },
      },
    }));
  }

  function updatePromotion(
    tier: "verified" | "pro",
    field: keyof AgentTierSettings["promotion"]["verified"],
    value: string,
  ) {
    setSettings((prev) => ({
      ...prev,
      promotion: {
        ...prev.promotion,
        [tier]: {
          ...prev.promotion[tier],
          [field]: Number(value),
        },
      },
    }));
  }

  async function save() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/tier-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = (await res.json()) as { error?: string; settings?: AgentTierSettings };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      if (data.settings) setSettings(data.settings);
      toast.success("Agent role prices saved — commission rates updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {VENDOR_TIERS.map((tierId) => {
          const role = settings.tiers[tierId];
          return (
            <div
              key={tierId}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-3"
            >
              <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
                {ROLE_LABELS[tierId]}
              </p>
              <div className="mt-3 space-y-2">
                <Field label="Role name">
                  <input
                    value={role.label}
                    onChange={(e) => updateRole(tierId, "label", e.target.value)}
                    className="admin-form-field-input"
                  />
                </Field>
                <Field label="Platform fee (%)">
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={role.commissionRate}
                    onChange={(e) => updateRole(tierId, "commissionRate", e.target.value)}
                    className="admin-form-field-input"
                  />
                </Field>
                <Field label="Reward rate (%)">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(role.rewardRate * 100)}
                    onChange={(e) =>
                      updateRole(tierId, "rewardRate", String(Number(e.target.value) / 100))
                    }
                    className="admin-form-field-input"
                  />
                </Field>
                <Field label="Min withdrawal (GHS)">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={role.minWithdrawal}
                    onChange={(e) => updateRole(tierId, "minWithdrawal", e.target.value)}
                    className="admin-form-field-input"
                  />
                </Field>
                <Field label="Description">
                  <input
                    value={role.description}
                    onChange={(e) => updateRole(tierId, "description", e.target.value)}
                    className="admin-form-field-input"
                  />
                </Field>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-300">
          Auto-promotion by role
        </p>
        <p className="mt-1 text-xs text-muted">
          When you click Apply roles, agents who hit these thresholds get promoted (unless manually
          assigned).
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["verified", "pro"] as const).map((tierKey) => (
            <div key={tierKey} className="space-y-2 rounded-md border border-white/8 p-2.5">
              <p className="text-xs font-bold text-foreground">
                Promote to {settings.tiers[tierKey].label}
              </p>
              <Field label="Min fulfilled orders">
                <input
                  type="number"
                  min={0}
                  value={settings.promotion[tierKey].minFulfilledOrders}
                  onChange={(e) => updatePromotion(tierKey, "minFulfilledOrders", e.target.value)}
                  className="admin-form-field-input"
                />
              </Field>
              <Field label="Min success rate (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.promotion[tierKey].minSuccessRate}
                  onChange={(e) => updatePromotion(tierKey, "minSuccessRate", e.target.value)}
                  className="admin-form-field-input"
                />
              </Field>
              <Field label="Min orders per day">
                <input
                  type="number"
                  min={0}
                  value={settings.promotion[tierKey].minDailyOrders}
                  onChange={(e) => updatePromotion(tierKey, "minDailyOrders", e.target.value)}
                  className="admin-form-field-input"
                />
              </Field>
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="susu-btn-gold inline-flex items-center gap-2"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save role prices
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
