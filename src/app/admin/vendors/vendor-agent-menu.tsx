"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  Edit3,
  KeyRound,
  Loader2,
  Lock,
  MinusCircle,
  PlusCircle,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatGHS } from "@/lib/format";
import { TIER_CONFIG, VENDOR_TIERS } from "@/lib/vendor/tiers";
import type { AgentTierPricing } from "@/lib/vendor/tier-settings-types";
import type { AdminVendorDetail } from "@/lib/data/admin-vendor-detail";
import type { VendorStatus, VendorTier } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  vendorId: string;
  businessName: string;
  slug: string;
  status: VendorStatus;
  tier: VendorTier;
  tierLabels?: Record<VendorTier, AgentTierPricing>;
}

type Panel = "menu" | "credit" | "debit" | "edit";

export function VendorAgentMenu({
  vendorId,
  businessName,
  slug,
  status: initialStatus,
  tier: initialTier,
  tierLabels,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>("menu");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminVendorDetail | null>(null);
  const [status, setStatus] = useState(initialStatus);
  const [tier, setTier] = useState(initialTier);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [editForm, setEditForm] = useState({
    fullName: "",
    phone: "",
    businessName: "",
    momoNumber: "",
    whatsappNumber: "",
  });
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const tierLabel = (id: VendorTier) => tierLabels?.[id]?.label ?? TIER_CONFIG[id].label;

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}`);
      if (!res.ok) throw new Error("Could not load agent");
      const data = await res.json();
      const v = data.vendor as AdminVendorDetail;
      setDetail(v);
      setStatus(v.status);
      setTier(v.tier);
      setEditForm({
        fullName: v.fullName ?? "",
        phone: v.phone ?? "",
        businessName: v.businessName,
        momoNumber: v.momoNumber ?? "",
        whatsappNumber: v.whatsappNumber ?? "",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (open) {
      setPanel("menu");
      setTempPassword(null);
      setAmount("");
      setNote("");
      void loadDetail();
    }
  }, [open, loadDetail]);

  async function patchStatus(payload: Record<string, unknown>, label: string) {
    setPending(label);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success(label);
      if (payload.status) setStatus(payload.status as VendorStatus);
      if (payload.tier) setTier(payload.tier as VendorTier);
      router.refresh();
      void loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function submitWallet(kind: "credit" | "debit") {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (note.trim().length < 2) {
      toast.error("Add a short reason");
      return;
    }
    setPending(kind);
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/wallet/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, note: note.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(
        kind === "credit"
          ? `Credited ${formatGHS(value)}${data.smsSent ? " · SMS sent" : ""}`
          : `Debited ${formatGHS(value)}${data.smsSent ? " · SMS sent" : ""}`,
      );
      setPanel("menu");
      setAmount("");
      setNote("");
      void loadDetail();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function saveProfile() {
    setPending("edit");
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          businessName: editForm.businessName.trim(),
          momoNumber: editForm.momoNumber.trim() || null,
          whatsappNumber: editForm.whatsappNumber.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      toast.success("Profile updated");
      setPanel("menu");
      router.refresh();
      void loadDetail();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  async function deleteAgent() {
    if (
      !window.confirm(
        `Permanently delete "${businessName}"? Their store and wallet will be removed so they can register again. This cannot be undone.`,
      )
    ) {
      return;
    }
    setPending("delete");
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Agent deleted — they can create a new account");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setPending(null);
    }
  }

  async function resetPassword() {
    if (!confirm("Reset this agent's password? They will receive the new password by SMS if a phone is on file.")) {
      return;
    }
    setPending("reset");
    try {
      const res = await fetch(`/api/admin/vendors/${vendorId}/reset-password`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setTempPassword(data.tempPassword as string);
      toast.success(data.message ?? "Password reset");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left font-semibold text-foreground underline-offset-2 hover:text-cyan-700 hover:underline"
      >
        {businessName}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#0f172a] shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-white">{businessName}</p>
                <p className="text-xs text-white/50">/{slug}</p>
                {detail && (
                  <p className="mt-1 text-xs font-semibold text-gold">
                    Wallet {formatGHS(detail.walletBalance)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-white/60 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-4 py-3">
              {loading && !detail ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-gold" />
                </div>
              ) : panel === "menu" ? (
                <div className="space-y-1">
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    <Badge variant={status === "approved" ? "success" : status === "pending" ? "warning" : "danger"}>
                      {status}
                    </Badge>
                    <Badge variant="default">{tierLabel(tier)}</Badge>
                  </div>

                  <MenuButton
                    icon={PlusCircle}
                    label="Credit wallet"
                    hint="Manual top-up when Paystack/network fails"
                    onClick={() => setPanel("credit")}
                  />
                  <MenuButton
                    icon={MinusCircle}
                    label="Debit wallet"
                    hint="Reverse an over-credit with agent approval"
                    onClick={() => setPanel("debit")}
                  />
                  <MenuButton
                    icon={Edit3}
                    label="Edit user"
                    hint="Fix name, phone, or MoMo number"
                    onClick={() => setPanel("edit")}
                  />

                  <div className="py-2">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      Change role
                    </label>
                    <select
                      value={tier}
                      disabled={pending !== null}
                      onChange={(e) => {
                        const next = e.target.value as VendorTier;
                        if (next !== tier) patchStatus({ tier: next }, `Role set to ${tierLabel(next)}`);
                      }}
                      className="mt-1 flex h-9 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm font-semibold text-white"
                    >
                      {VENDOR_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {tierLabel(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {status !== "approved" && (
                    <MenuButton
                      icon={ShieldCheck}
                      label="Verify user"
                      hint="Approve agent and mark verified"
                      loading={pending === "Verify user"}
                      onClick={() => patchStatus({ status: "approved", verified: true }, "Verify user")}
                    />
                  )}

                  {status === "approved" ? (
                    <MenuButton
                      icon={Lock}
                      label="Freeze user"
                      hint="Suspend agent account"
                      loading={pending === "Freeze user"}
                      onClick={() => patchStatus({ status: "suspended" }, "Freeze user")}
                    />
                  ) : status === "suspended" ? (
                    <MenuButton
                      icon={ShieldCheck}
                      label="Unfreeze user"
                      hint="Restore agent access"
                      loading={pending === "Unfreeze user"}
                      onClick={() => patchStatus({ status: "approved" }, "Unfreeze user")}
                    />
                  ) : null}

                  <MenuButton
                    icon={KeyRound}
                    label="Reset password"
                    hint="Generate new password · SMS if phone on file"
                    loading={pending === "reset"}
                    onClick={resetPassword}
                  />

                  {(status === "suspended" || status === "rejected") && (
                    <MenuButton
                      icon={Trash2}
                      label="Delete agent"
                      hint="Remove account entirely so they can register again"
                      loading={pending === "delete"}
                      onClick={() => void deleteAgent()}
                    />
                  )}

                  {tempPassword && (
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                      <p className="font-semibold">Temporary password</p>
                      <p className="mt-1 font-mono text-sm">{tempPassword}</p>
                      <p className="mt-1 text-amber-200/80">Share securely if SMS was not sent.</p>
                    </div>
                  )}
                </div>
              ) : panel === "credit" || panel === "debit" ? (
                <WalletForm
                  kind={panel}
                  amount={amount}
                  note={note}
                  pending={pending === panel}
                  onAmount={setAmount}
                  onNote={setNote}
                  onBack={() => setPanel("menu")}
                  onSubmit={() => void submitWallet(panel)}
                />
              ) : (
                <EditForm
                  form={editForm}
                  pending={pending === "edit"}
                  onChange={setEditForm}
                  onBack={() => setPanel("menu")}
                  onSave={() => void saveProfile()}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MenuButton({
  icon: Icon,
  label,
  hint,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-[11px] text-white/45">{hint}</span>}
      </span>
      {loading && <Loader2 className="ml-auto h-4 w-4 animate-spin text-white/40" />}
    </button>
  );
}

function WalletForm({
  kind,
  amount,
  note,
  pending,
  onAmount,
  onNote,
  onBack,
  onSubmit,
}: {
  kind: "credit" | "debit";
  amount: string;
  note: string;
  pending: boolean;
  onAmount: (v: string) => void;
  onNote: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-white/50 hover:text-white">
        ← Back
      </button>
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-gold" />
        <p className="text-sm font-bold text-white">
          {kind === "credit" ? "Credit wallet" : "Debit wallet"}
        </p>
      </div>
      <label className="block text-xs font-medium text-white/50">
        Amount (GHS)
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(e) => onAmount(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
          placeholder="50.00"
        />
      </label>
      <label className="block text-xs font-medium text-white/50">
        Reason (required)
        <input
          value={note}
          onChange={(e) => onNote(e.target.value)}
          className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
          placeholder="Paystack down — manual credit"
        />
      </label>
      <Button
        className="w-full bg-gold text-navy-950 hover:bg-gold-glow"
        disabled={pending}
        onClick={onSubmit}
      >
        {pending ? "Processing…" : kind === "credit" ? "Credit wallet" : "Debit wallet"}
      </Button>
      <p className="text-[10px] text-white/40">
        Agent receives an SMS notification when a phone number is on their profile.
      </p>
    </div>
  );
}

function EditForm({
  form,
  pending,
  onChange,
  onBack,
  onSave,
}: {
  form: {
    fullName: string;
    phone: string;
    businessName: string;
    momoNumber: string;
    whatsappNumber: string;
  };
  pending: boolean;
  onChange: (f: typeof form) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-xs font-semibold text-white/50 hover:text-white">
        ← Back
      </button>
      <p className="text-sm font-bold text-white">Edit user</p>
      {(
        [
          ["fullName", "Full name"],
          ["phone", "Phone"],
          ["businessName", "Business name"],
          ["momoNumber", "MoMo number"],
          ["whatsappNumber", "WhatsApp"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="block text-xs font-medium text-white/50">
          {label}
          <input
            value={form[key]}
            onChange={(e) => onChange({ ...form, [key]: e.target.value })}
            className={cn(
              "mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white",
            )}
          />
        </label>
      ))}
      <Button
        className="w-full bg-gold text-navy-950 hover:bg-gold-glow"
        disabled={pending}
        onClick={onSave}
      >
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </div>
  );
}
