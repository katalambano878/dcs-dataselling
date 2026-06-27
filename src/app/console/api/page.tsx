import Link from "next/link";
import { SITE } from "@/lib/constants";
import { getConsolePublicUrl } from "@/lib/platform/console-host";

export const dynamic = "force-dynamic";

export default function ConsoleApiPage() {
  const base = getConsolePublicUrl();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">API</h1>
      <p className="text-sm text-muted-foreground">
        Use the same developer API keys from your main {SITE.shortName} agent account. Console
        endpoints debit your <strong>data balance (MB)</strong>, not your GHS wallet.
      </p>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <div>
          <p className="font-semibold">GET /api/v1/console/balance</p>
          <p className="text-muted-foreground">Returns balance_mb, total_sends, enabled.</p>
        </div>
        <div>
          <p className="font-semibold">POST /api/v1/console/send</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{`{
  "recipient_phone": "0241234567",
  "network": "mtn",
  "amount_mb": 1000,
  "reference": "optional-idempotency-key"
}`}</pre>
        </div>
        <div>
          <p className="font-semibold">GET /api/v1/console/transactions</p>
          <p className="text-muted-foreground">Recent send history for this console account.</p>
        </div>
      </div>

      <p className="text-sm">
        Manage API keys on the{" "}
        <Link href={`${SITE.url}/vendor/dashboard/developer`} className="text-blue-600 hover:underline">
          main developer dashboard
        </Link>
        . Base URL for console API: <code className="text-xs">{base}</code>
      </p>
    </div>
  );
}
