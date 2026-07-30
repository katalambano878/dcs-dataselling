"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Award,
  KeyRound,
  Pencil,
  User,
  UserCircle,
  Wallet,
} from "lucide-react";
import { DashboardModal } from "@/components/shared/dashboard-modal";
import {
  DashboardInfoCard,
  DashboardInfoField,
  DashboardProfileHero,
} from "@/components/shared/dashboard-page-hero";
import { ProfilePhotoField } from "@/components/shared/profile-photo-field";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatGHS, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

function isValidGhanaPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return (
    (digits.length === 10 && digits.startsWith("0")) ||
    (digits.length === 12 && digits.startsWith("233")) ||
    digits.length === 9
  );
}

export interface AgentProfileViewProps {
  fullName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  email: string;
  phone: string | null;
  whatsapp: string | null;
  businessName: string;
  slug: string;
  tierLabel: string;
  statusLabel: string;
  isActive: boolean;
  walletBalance: number;
  topupsThisMonth: number;
  topupsThisYear: number;
  commissionRate: string;
  rewardRate: string;
  minWithdrawal: string;
  tierHint: string | null;
}

export function AgentProfileView(props: AgentProfileViewProps) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: props.fullName,
    phone: props.phone ?? "",
    whatsapp: props.whatsapp ?? "",
  });
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirm: "",
  });
  const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl);

  const initials = props.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  async function saveProfile() {
    if (!isValidGhanaPhone(editForm.phone)) {
      toast.error("A valid phone number is required so we can send you SMS alerts.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/vendor/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
          whatsapp: editForm.whatsapp.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save profile");
      toast.success("Profile updated");
      setEditOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword() {
    if (passwordForm.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (passwordForm.password !== passwordForm.confirm) {
      toast.error("Passwords do not match");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: passwordForm.password }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update password");
      toast.success("Password updated");
      setPasswordOpen(false);
      setPasswordForm({ password: "", confirm: "" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <DashboardProfileHero
        initials={initials || "AG"}
        fullName={props.fullName}
        email={props.email}
        avatarUrl={avatarUrl}
        badges={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              <UserCircle className="h-3.5 w-3.5" />
              {props.tierLabel}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
                props.isActive
                  ? "border border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                  : "border border-amber-400/30 bg-amber-500/15 text-amber-200",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  props.isActive ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
              {props.statusLabel}
            </span>
          </>
        }
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              onClick={() => {
                setEditForm({
                  fullName: props.fullName,
                  phone: props.phone ?? "",
                  whatsapp: props.whatsapp ?? "",
                });
                setEditOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" />
              Edit Profile
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound className="h-4 w-4" />
              Change Password
            </Button>
          </>
        }
      />

      {/* Info cards */}
      <div className="grid gap-5 lg:grid-cols-2">
        <DashboardInfoCard icon={User} title="Personal Information" iconTone="blue">
          <div className="grid gap-5 sm:grid-cols-2">
            <DashboardInfoField label="First Name" value={props.firstName} />
            <DashboardInfoField label="Last Name" value={props.lastName} />
            <DashboardInfoField label="Email" value={props.email} />
            <DashboardInfoField
              label="Phone"
              value={props.phone ? formatPhone(props.phone) : "—"}
            />
            <DashboardInfoField
              label="WhatsApp"
              value={props.whatsapp ? formatPhone(props.whatsapp) : "—"}
            />
            <DashboardInfoField label="Business Name" value={props.businessName} />
            <DashboardInfoField label="Store handle" value={`/${props.slug}`} />
          </div>
        </DashboardInfoCard>

        <DashboardInfoCard icon={Wallet} title="Wallet Information" iconTone="emerald">

          <div className="mb-5 flex items-center justify-between rounded-xl bg-emerald-500 px-4 py-4 text-white shadow-md">
            <div>
              <p className="text-xs font-medium text-emerald-50">Current Balance</p>
              <p className="mt-1 text-3xl font-extrabold tracking-tight">
                {formatGHS(props.walletBalance)}
              </p>
            </div>
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600/80">
              <Wallet className="h-6 w-6 text-white" />
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                This Month
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatGHS(props.topupsThisMonth)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Wallet top-ups</p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                This Year
              </p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {formatGHS(props.topupsThisYear)}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">Wallet top-ups</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link href="/vendor/dashboard/wallet">View wallet</Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link href="/vendor/dashboard/transactions">Transactions</Link>
            </Button>
          </div>
        </DashboardInfoCard>
      </div>

      <DashboardInfoCard
        icon={Award}
        title="Agent role & benefits"
        description="Your tier controls fees, rewards, and withdrawal limits."
        iconTone="violet"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardInfoField label="Current role" value={props.tierLabel} />
          <DashboardInfoField label="Platform fee" value={props.commissionRate} />
          <DashboardInfoField label="Reward rate" value={props.rewardRate} />
          <DashboardInfoField label="Min withdrawal" value={props.minWithdrawal} />
        </div>
        {props.tierHint && (
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
            {props.tierHint}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link href="/vendor/dashboard/storefront">Storefront</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/vendor/dashboard/referrals">Referrals</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/vendor/dashboard/wishlist">Wishlist</Link>
          </Button>
        </div>
      </DashboardInfoCard>

      <DashboardModal open={editOpen} title="Edit profile" onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          <ProfilePhotoField
            initials={initials || "AG"}
            avatarUrl={avatarUrl}
            uploadUrl="/api/vendor/profile/avatar"
            onUploaded={(url) => {
              setAvatarUrl(url);
              router.refresh();
            }}
          />
          <Input
            label="Full name"
            value={editForm.fullName}
            onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
          />
          <Input
            label="Phone"
            value={editForm.phone}
            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0241234567"
            hint="Required — wallet and order alerts are sent here by SMS."
            required
          />
          <Input
            label="WhatsApp"
            value={editForm.whatsapp}
            onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
            placeholder="0241234567"
          />
          <Button className="w-full" disabled={saving} onClick={saveProfile}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </DashboardModal>

      <DashboardModal open={passwordOpen} title="Change password" onClose={() => setPasswordOpen(false)}>
        <div className="space-y-4">
          <Input
            label="New password"
            type="password"
            value={passwordForm.password}
            onChange={(e) => setPasswordForm((f) => ({ ...f, password: e.target.value }))}
            autoComplete="new-password"
          />
          <Input
            label="Confirm password"
            type="password"
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
            autoComplete="new-password"
          />
          <Button className="w-full" disabled={saving} onClick={savePassword}>
            {saving ? "Updating…" : "Update password"}
          </Button>
        </div>
      </DashboardModal>
    </div>
  );
}
