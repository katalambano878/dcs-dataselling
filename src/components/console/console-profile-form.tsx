"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, User } from "lucide-react";
import { toast } from "sonner";
import { AdminSection } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatConsoleData } from "@/lib/console/units";
import { formatPhone } from "@/lib/format";

export interface ConsoleProfileFormProps {
  fullName: string;
  businessName: string;
  email: string;
  phone: string;
  whatsapp: string;
  username: string;
  balanceMb: number;
  profileComplete: boolean;
}

function isValidGhanaPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  return (
    (digits.length === 10 && digits.startsWith("0")) ||
    (digits.length === 12 && digits.startsWith("233")) ||
    digits.length === 9
  );
}

export function ConsoleProfileForm({
  fullName: initialFullName,
  businessName: initialBusinessName,
  email,
  phone: initialPhone,
  whatsapp: initialWhatsapp,
  username,
  balanceMb,
  profileComplete,
}: ConsoleProfileFormProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: initialFullName,
    businessName: initialBusinessName,
    phone: initialPhone,
    whatsapp: initialWhatsapp,
  });

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidGhanaPhone(form.phone)) {
      toast.error("Enter a valid Ghana phone number.");
      return;
    }
    if (form.fullName.trim().length < 2) {
      toast.error("Enter your full name.");
      return;
    }
    if (form.businessName.trim().length < 2) {
      toast.error("Enter your business or agent name.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/console/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName.trim(),
          businessName: form.businessName.trim(),
          phone: form.phone.trim(),
          whatsapp: form.whatsapp.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save profile");
      toast.success("Profile updated");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminSection
      title="User Profile"
      description={
        profileComplete
          ? "Update your contact details. These apply across dcselite.com and the data console."
          : "Complete your profile before sending bundles from the console."
      }
      icon={User}
    >
      <form onSubmit={saveProfile} className="space-y-4 p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
            required
            className="border-white/10 bg-white/5 text-white"
          />
          <Input
            label="Business / agent name"
            value={form.businessName}
            onChange={(e) => setForm((f) => ({ ...f, businessName: e.target.value }))}
            required
            className="border-white/10 bg-white/5 text-white"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Email</label>
            <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70">
              {email}
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-200">Username</label>
            <p className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 font-mono text-sm text-white/70">
              @{username}
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="0241234567"
            required
            className="border-white/10 bg-white/5 text-white"
          />
          <Input
            label="WhatsApp (optional)"
            value={form.whatsapp}
            onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            placeholder="0241234567"
            className="border-white/10 bg-white/5 text-white"
          />
        </div>

        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70">
          Console balance:{" "}
          <span className="font-semibold text-white">{formatConsoleData(balanceMb)}</span>
          {form.phone && isValidGhanaPhone(form.phone) ? (
            <span className="mt-1 block text-white/55">
              SMS alerts will go to {formatPhone(form.phone.replace(/\D/g, "").length === 9 ? `0${form.phone.replace(/\D/g, "")}` : form.phone)}
            </span>
          ) : null}
        </div>

        <Button type="submit" disabled={saving} className="inline-flex items-center gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save profile
        </Button>
      </form>
    </AdminSection>
  );
}
