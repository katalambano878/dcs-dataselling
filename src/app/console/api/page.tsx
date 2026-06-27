import Link from "next/link";
import { Code, ExternalLink } from "lucide-react";
import { AdminPageIntro, AdminPageRoot, AdminSection } from "@/components/admin";
import { SITE } from "@/lib/constants";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default function ConsoleApiPage() {
  const base = getConsolePublicUrl();

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Developer"
        description={
          <>
            Use the same developer API keys from your main {SITE.shortName} agent account. Console
            endpoints debit your data balance (MB), not your GHS wallet.
          </>
        }
        meta={`Base URL · ${base}`}
      />

      <AdminSection title="Console API" icon={Code}>
        <div className="space-y-4 p-4 sm:p-5 text-sm text-white/80">
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

          <p>
            Manage API keys on the{" "}
            <Link
              href={`${SITE.url}/vendor/dashboard/developer`}
              className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200"
            >
              main developer dashboard
              <ExternalLink className="h-3 w-3" />
            </Link>
            .
          </p>
        </div>
      </AdminSection>
    </AdminPageRoot>
  );
}
