import type { Metadata } from "next";
import { Construction } from "lucide-react";
import { SITE } from "@/lib/constants";
import { getPlatformConfig } from "@/lib/data/platform-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const config = await getPlatformConfig();
  const message =
    config.maintenanceMessage.trim() ||
    "We're performing scheduled maintenance. Please check back shortly.";

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-[#0A2E5D] via-[#0f172a] to-[#1e293b] px-4 py-16 text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
          <Construction className="h-7 w-7" />
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-amber-300/90">
          Maintenance mode
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">{SITE.name}</h1>
        <p className="mt-4 text-sm leading-relaxed text-white/75">{message}</p>
        <p className="mt-6 text-xs text-white/45">
          Payment processing and admin operations continue in the background.
        </p>
      </div>
    </div>
  );
}
