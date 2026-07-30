"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  Banknote,
  BarChart3,
  CheckCircle2,
  Heart,
  KeyRound,
  LineChart,
  Pencil,
  Percent,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingCart,
  Store,
  User,
  UserCircle,
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
import type {
  AdminOrderSnapshot,
  AdminPlatformSnapshot,
  AdminProfileRecord,
} from "@/types";

interface Props {
  profile: AdminProfileRecord;
  platform: AdminPlatformSnapshot;
  orders: AdminOrderSnapshot;
}

function RoleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">
      {label}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
        active ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-700",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", active ? "bg-rose-500" : "bg-amber-500")} />
      ACTIVE
    </span>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "violet" | "emerald" | "amber" | "sky";
}) {
  const tones = {
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    sky: "border-sky-100 bg-sky-50 text-sky-700",
  };

  return (
    <div className={cn("rounded-xl border p-4", tones[tone])}>
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg bg-white/80">
        {icon}
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-slate-900">{value}</p>
    </div>
  );
}

export function AdminProfileView({ profile, platform, orders }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    fullName: profile.fullName,
    phone: profile.phone ?? "",
  });
  const [passwordForm, setPasswordForm] = useState({ password: "", confirm: "" });
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);

  const initials = profile.fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: editForm.fullName.trim(),
          phone: editForm.phone.trim(),
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
        initials={initials || "AD"}
        fullName={profile.fullName}
        email={profile.email}
        avatarUrl={avatarUrl}
        badges={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white">
              <UserCircle className="h-3.5 w-3.5" />
              {profile.roleLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              ACTIVE
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
                setEditForm({ fullName: profile.fullName, phone: profile.phone ?? "" });
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

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-5">
          <DashboardInfoCard icon={User} title="Personal Information" iconTone="blue">
            <div className="grid gap-5 sm:grid-cols-2">
              <DashboardInfoField label="First Name" value={profile.firstName} />
              <DashboardInfoField label="Last Name" value={profile.lastName} />
              <DashboardInfoField label="Email" value={profile.email} />
              <DashboardInfoField
                label="Phone"
                value={profile.phone ? formatPhone(profile.phone) : "—"}
              />
            </div>
          </DashboardInfoCard>

          <DashboardInfoCard icon={ShieldCheck} title="Account Information" iconTone="emerald">
            <div className="grid gap-5 sm:grid-cols-2">
              <DashboardInfoField label="Username" value={profile.username} />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Role
                </p>
                <div className="mt-1">
                  <RoleBadge label={profile.roleLabel} />
                </div>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge active />
                </div>
              </div>
              <DashboardInfoField label="Member Since" value={profile.memberSince} />
              <DashboardInfoField label="Account Age" value={profile.accountAge} />
            </div>
          </DashboardInfoCard>

          <DashboardInfoCard icon={LineChart} title="Transaction & Order Statistics" iconTone="sky">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatTile
                icon={<ShoppingCart className="h-5 w-5" />}
                label="Total Orders"
                value={String(orders.totalOrders)}
                tone="violet"
              />
              <StatTile
                icon={<CheckCircle2 className="h-5 w-5" />}
                label="Completed"
                value={String(orders.completedOrders)}
                tone="emerald"
              />
              <StatTile
                icon={<Percent className="h-5 w-5" />}
                label="Success Rate"
                value={`${orders.successRate.toFixed(1)}%`}
                tone="amber"
              />
              <StatTile
                icon={<Banknote className="h-5 w-5" />}
                label="Lifetime GMV"
                value={formatGHS(orders.lifetimeRevenue)}
                tone="sky"
              />
            </div>
          </DashboardInfoCard>
        </div>

        <div className="space-y-5">
          <DashboardInfoCard icon={BarChart3} title="Platform Overview" iconTone="indigo">

            <div className="mb-5 flex items-center justify-between rounded-xl bg-indigo-600 px-4 py-4 text-white shadow-md">
              <div>
                <p className="text-xs font-medium text-indigo-100">GMV (30 days)</p>
                <p className="mt-1 text-3xl font-extrabold tracking-tight">
                  {formatGHS(platform.gmv30d)}
                </p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-700/80">
                <Activity className="h-6 w-6 text-white" />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Platform Revenue
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatGHS(platform.platformRevenue30d)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">Last 30 days</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Orders Today
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">{platform.ordersToday}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Across all stores</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Active Vendors
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">{platform.activeVendors}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Payment Success
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {platform.successRate.toFixed(1)}%
                </p>
              </div>
            </div>
          </DashboardInfoCard>

          <DashboardInfoCard
            icon={Shield}
            title="Platform Access"
            description="Shortcuts to admin tools you manage."
            iconTone="violet"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Link
                href="/admin/settings"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <Settings className="h-4 w-4 text-indigo-600" />
                Settings
              </Link>
              <Link
                href="/admin/vendors"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <Store className="h-4 w-4 text-indigo-600" />
                Vendors
              </Link>
              <Link
                href="/admin/operations"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
                Operations
              </Link>
              <Link
                href="/admin/analytics"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <BarChart3 className="h-4 w-4 text-indigo-600" />
                Analytics
              </Link>
              <Link
                href="/admin/wishlist"
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 transition hover:border-indigo-200 hover:bg-indigo-50"
              >
                <Heart className="h-4 w-4 text-indigo-600" />
                Wishlist
              </Link>
            </div>
          </DashboardInfoCard>
        </div>
      </div>

      <DashboardModal open={editOpen} title="Edit profile" onClose={() => setEditOpen(false)}>
        <div className="space-y-4">
          <ProfilePhotoField
            initials={initials || "AD"}
            avatarUrl={avatarUrl}
            uploadUrl="/api/admin/profile/avatar"
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
