import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Cable,
  Clock,
  Layers,
  RefreshCw,
  Server,
} from "lucide-react";
import {
  AdminAlert,
  AdminEmptyState,
  AdminEnvCheckList,
  AdminNetworkRoute,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
  AdminStatGrid,
  AdminStatTile,
  AdminStatusBadge,
} from "@/components/admin";
import { requireRole } from "@/lib/auth/session";
import { isIshareConfigured } from "@/lib/suppliers/ishare";
import { isRailwayExternalConfigured } from "@/lib/suppliers/railway-external";
import { isSkanka5Configured } from "@/lib/suppliers/skanka5";
import { isSuccessBizHubConfigured } from "@/lib/suppliers/successbizhub";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { getNetworkSupplierMatrixResolved } from "@/lib/suppliers/routing";
import {
  fetchSupplierLogs,
  fetchSupplierSummary,
  fetchFailedSupplierOrders,
  fetchAwaitingManualOrders,
} from "@/lib/data/supplier-logs";
import { SupplierPollRailwayButton } from "./supplier-poll-railway-button";
import { SupplierPingButton } from "./supplier-ping-button";
import { SupplierLogTable } from "./supplier-log-table";
import { FailedOrderList } from "./failed-order-list";
import { AwaitingManualList } from "./awaiting-manual-list";
import { SupplierRoutingControls } from "./supplier-routing-controls";

export const dynamic = "force-dynamic";

export default async function SupplierConsolePage() {
  const profile = await requireRole(["admin", "ops"]);
  if (!profile) redirect("/auth/login");

  const [summary, logs, failed, manualQueue, platformConfig, matrix] = await Promise.all([
    fetchSupplierSummary(),
    fetchSupplierLogs(100),
    fetchFailedSupplierOrders(),
    fetchAwaitingManualOrders(),
    getPlatformConfig(),
    getNetworkSupplierMatrixResolved(),
  ]);

  const configured = isSkanka5Configured();
  const sbhConfigured = isSuccessBizHubConfigured();
  const ishareConfigured = isIshareConfigured();
  const railwayConfigured = isRailwayExternalConfigured();
  const webhookConfigured = Boolean(process.env.SKANKA5_WEBHOOK_SECRET);
  const unsignedMode = process.env.SKANKA5_ALLOW_UNSIGNED_WEBHOOKS === "1";

  const sbhEnvChecks: Array<{ name: string; present: boolean; required: boolean }> = [
    { name: "SUCCESSBIZHUB_API_KEY", present: sbhConfigured, required: true },
    { name: "SUCCESSBIZHUB_OFFER_SLUG_MTN", present: Boolean(process.env.SUCCESSBIZHUB_OFFER_SLUG_MTN), required: false },
    { name: "SUCCESSBIZHUB_OFFER_SLUG_TELECEL", present: Boolean(process.env.SUCCESSBIZHUB_OFFER_SLUG_TELECEL), required: false },
    { name: "SUCCESSBIZHUB_OFFER_SLUG_AT", present: Boolean(process.env.SUCCESSBIZHUB_OFFER_SLUG_AT), required: false },
  ];

  const manualNetworks = matrix.filter((m) => m.manual).length;

  const SUPPLIER_SHORT: Record<string, string> = {
    skanka5: "Skanka5",
    successbizhub: "DataCoreGH",
    railwayexternal: "Railway API",
    ishare: "iShare",
    manual: "Manual",
  };

  const ishareEnvChecks: Array<{ name: string; present: boolean; required: boolean }> = [
    { name: "ISHARE_API_KEY", present: ishareConfigured, required: true },
    { name: "ISHARE_MERCHANT_SLUG", present: Boolean(process.env.ISHARE_MERCHANT_SLUG), required: false },
    { name: "ISHARE_BASE_URL", present: Boolean(process.env.ISHARE_BASE_URL), required: false },
  ];

  const railwayEnvChecks: Array<{ name: string; present: boolean; required: boolean }> = [
    {
      name: "RAILWAY_EXTERNAL_API_KEY",
      present: Boolean(process.env.RAILWAY_EXTERNAL_API_KEY?.trim()),
      required: true,
    },
    {
      name: "RAILWAY_EXTERNAL_BASE_URL",
      present: Boolean(process.env.RAILWAY_EXTERNAL_BASE_URL?.trim()),
      required: true,
    },
  ];

  const envChecks: Array<{ name: string; present: boolean; required: boolean }> = [
    { name: "SKANKA5_API_KEY", present: Boolean(process.env.SKANKA5_API_KEY), required: true },
    { name: "SKANKA5_NETWORK_ID_MTN", present: Boolean(process.env.SKANKA5_NETWORK_ID_MTN), required: true },
    { name: "SKANKA5_NETWORK_ID_TELECEL", present: Boolean(process.env.SKANKA5_NETWORK_ID_TELECEL), required: false },
    { name: "SKANKA5_NETWORK_ID_AT", present: Boolean(process.env.SKANKA5_NETWORK_ID_AT), required: false },
    { name: "SKANKA5_WEBHOOK_SECRET", present: Boolean(process.env.SKANKA5_WEBHOOK_SECRET), required: false },
  ];
  const missingRequired = envChecks.filter((c) => c.required && !c.present);

  const NETWORK_LABEL: Record<(typeof matrix)[number]["network"], string> = {
    mtn: "MTN",
    telecel: "Telecel",
    at: "AirtelTigo",
  };

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Data fulfilment"
        description="All 3 networks can use Skanka5, Success Biz Hub, or manual fulfilment — switch any time in routing control below."
        meta={`${summary.awaitingManual} order${summary.awaitingManual === 1 ? "" : "s"} awaiting manual fulfilment`}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {matrix.map((row) => (
              <span
                key={row.network}
                className={
                  row.manual
                    ? "admin-status-badge is-warn"
                    : row.configured
                      ? "admin-status-badge is-ok"
                      : "admin-status-badge is-warn"
                }
              >
                {NETWORK_LABEL[row.network]} · {SUPPLIER_SHORT[row.supplierId] ?? row.supplierId}
              </span>
            ))}
          </div>
        }
      />

      <AdminSection
        title="Network → supplier routing"
        description="Assign each network to Skanka5, Success Biz Hub, or manual fulfilment below — any API can handle any network."
        icon={Layers}
      >
        <ul className="admin-network-list">
          {matrix.map((row) => (
            <AdminNetworkRoute
              key={row.network}
              network={row.network}
              networkLabel={NETWORK_LABEL[row.network]}
              supplierLabel={row.supplierLabel}
              envKey={`SUPPLIER_FOR_${row.network.toUpperCase()}`}
              source={row.source}
              status={
                row.manual
                  ? "manual"
                  : row.configured
                    ? "connected"
                    : "misconfigured"
              }
            />
          ))}
        </ul>
        <SupplierRoutingControls
          routing={platformConfig.supplierRouting}
          envDefaults={{
            mtn: process.env.SUPPLIER_FOR_MTN?.trim().toLowerCase() ?? "skanka5",
            telecel: process.env.SUPPLIER_FOR_TELECEL?.trim().toLowerCase() ?? "manual",
            at: process.env.SUPPLIER_FOR_AT?.trim().toLowerCase() ?? "manual",
          }}
          effective={{
            mtn: matrix.find((m) => m.network === "mtn")?.supplierId ?? "skanka5",
            telecel: matrix.find((m) => m.network === "telecel")?.supplierId ?? "manual",
            at: matrix.find((m) => m.network === "at")?.supplierId ?? "manual",
          }}
          skanka5Configured={configured}
          sbhConfigured={sbhConfigured}
          ishareConfigured={ishareConfigured}
          railwayConfigured={railwayConfigured}
        />
        {manualNetworks > 0 && (
          <AdminAlert
            tone="info"
            title={`${manualNetworks} network${manualNetworks === 1 ? " is" : "s are"} on manual right now`}
          >
            That is the current mode, not a permanent limit — use <strong>Admin routing control</strong> above
            to switch any network to <strong>Skanka5</strong> or <strong>Success Biz Hub</strong> for automated
            dispatch. Manual mode keeps orders in <code>queued</code> until you fulfil them by hand.
          </AdminAlert>
        )}
      </AdminSection>

      <AdminSection
        title="Skanka5 credentials & webhook"
        description="MTN automated supplier — API connectivity and callback signing."
        icon={Cable}
      >
        <div className="flex flex-wrap gap-1.5">
          <AdminStatusBadge ok={configured} label="API" />
          <AdminStatusBadge
            ok={webhookConfigured}
            label="Webhook"
            okText="Signed"
            failText="No secret"
          />
        </div>

        <AdminAlert
          tone={missingRequired.length > 0 ? "warning" : "success"}
          title={
            missingRequired.length > 0
              ? `Missing ${missingRequired.length} required env var${missingRequired.length === 1 ? "" : "s"}`
              : "All required Skanka5 env vars detected"
          }
        >
          <AdminEnvCheckList items={envChecks} />
          {missingRequired.length > 0 && (
            <p className="mt-2">
              <strong>Vercel:</strong> Project → Settings → Environment Variables (Production scope),
              then redeploy. Vars added after deploy do not retro-apply.
            </p>
          )}
        </AdminAlert>
      </AdminSection>

      <AdminSection
        title="Success Biz Hub (alternate supplier)"
        description="Telecel automated supplier — toggle routing above or set SUPPLIER_FOR_TELECEL=successbizhub in env."
        icon={Cable}
      >
        <div className="flex flex-wrap gap-1.5">
          <AdminStatusBadge ok={sbhConfigured} label="API key" />
        </div>
        <AdminAlert
          tone={sbhConfigured ? "success" : "warning"}
          title={sbhConfigured ? "Success Biz Hub API key detected" : "SUCCESSBIZHUB_API_KEY not set"}
        >
          <AdminEnvCheckList items={sbhEnvChecks} />
          <p className="mt-2 text-xs text-muted-foreground">
            Docs:{" "}
            <a
              href="https://documenter.getpostman.com/view/36783125/2sBXcLfxJU"
              className="font-semibold text-amber-800 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Success Biz Hub API
            </a>
            . Webhook endpoint:{" "}
            <code>/api/webhooks/successbizhub</code>
          </p>
        </AdminAlert>
      </AdminSection>

      <AdminSection
        title="iShare (MultiData Ghana)"
        description="AT data console fulfilment — route AirtelTigo via Admin routing or SUPPLIER_FOR_AT=ishare."
        icon={Cable}
      >
        <div className="flex flex-wrap gap-1.5">
          <AdminStatusBadge ok={ishareConfigured} label="API key" />
        </div>
        <AdminAlert
          tone={ishareConfigured ? "success" : "warning"}
          title={ishareConfigured ? "iShare API key detected" : "ISHARE_API_KEY not set"}
        >
          <AdminEnvCheckList items={ishareEnvChecks} />
          <p className="mt-2 text-xs text-muted-foreground">
            Endpoint:{" "}
            <code>https://multidataghana.com/merchintegrate/&lt;merchant&gt;/ishare_api/</code>. Use hostname
            (not raw IP) so TLS works in Node. Default merchant slug:{" "}
            <code>divinelychosenstar</code>.
          </p>
        </AdminAlert>
      </AdminSection>

      <AdminSection
        title="Railway API (external supplier)"
        description="Outbound wholesale API — products, orders, and status polling (no webhook)."
        icon={Cable}
      >
        <div className="flex flex-wrap gap-1.5">
          <AdminStatusBadge ok={railwayConfigured} label="configured" />
        </div>
        <AdminAlert
          tone={railwayConfigured ? "success" : "warning"}
          title={
            railwayConfigured
              ? "Railway API ready"
              : "Railway API needs API key + live BASE_URL"
          }
        >
          <AdminEnvCheckList items={railwayEnvChecks} />
          <p className="mt-2 text-xs text-muted-foreground">
            Set <code>RAILWAY_EXTERNAL_BASE_URL</code> to the live host ending in{" "}
            <code>/api/external</code>. The old{" "}
            <code>backend-production-1d8b.up.railway.app</code> host is dead (Railway: Application
            not found) — that is why Telecel/MTN orders fail when Railway is selected. Map products
            with <code>RAILWAY_PRODUCT_ID_TELECEL_5GB</code> etc. if auto-match fails.
          </p>
        </AdminAlert>
      </AdminSection>

      {unsignedMode && (
        <AdminAlert tone="danger" title="Unsigned webhook mode is ON">
          <code>SKANKA5_ALLOW_UNSIGNED_WEBHOOKS=1</code> is set. Webhooks are accepted without verifying{" "}
          <code>X-Skanka5-Signature</code>. Turn this off once you have a real{" "}
          <code>SKANKA5_WEBHOOK_SECRET</code>.
        </AdminAlert>
      )}

      <AdminStatGrid>
        <AdminStatTile
          icon={<Server className="h-4 w-4" />}
          tone="sky"
          label="Total events"
          value={summary.total.toLocaleString()}
          hint="All time"
        />
        <AdminStatTile
          icon={<RefreshCw className="h-4 w-4" />}
          tone="emerald"
          label="Submits · 24h"
          value={summary.last24h.submits.toLocaleString()}
        />
        <AdminStatTile
          icon={<AlertTriangle className="h-4 w-4" />}
          tone="rose"
          label="Submit failures · 24h"
          value={summary.last24h.submitFailures.toLocaleString()}
          valueAccent={summary.last24h.submitFailures > 0 ? "rose" : undefined}
        />
        <AdminStatTile
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          label="Awaiting manual"
          value={summary.awaitingManual.toLocaleString()}
        />
      </AdminStatGrid>

      {summary.awaitingManual > 0 && (
        <AdminSection
          title="Awaiting manual fulfilment"
          description="Paid orders with no automated supplier — recharge the buyer, then mark fulfilled."
          icon={Clock}
          actions={
            <span className="susu-pill susu-pill-warn">
              {manualQueue.length} order{manualQueue.length === 1 ? "" : "s"}
            </span>
          }
        >
          <AwaitingManualList orders={manualQueue} />
        </AdminSection>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <AdminSection
          title="Diagnostics"
          description="Ping GET /fetch-networks to confirm connectivity."
          icon={Activity}
        >
          <SupplierPingButton disabled={!configured} supplier="skanka5" />
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Success Biz Hub</p>
            <SupplierPingButton disabled={!sbhConfigured} supplier="successbizhub" />
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">iShare</p>
            <SupplierPingButton disabled={!ishareConfigured} supplier="ishare" label="Ping balance" />
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-semibold text-muted-foreground">Railway API</p>
            <SupplierPingButton
              disabled={!railwayConfigured}
              supplier="railwayexternal"
              label="Ping /products"
            />
            <div className="mt-2">
              <SupplierPollRailwayButton disabled={!railwayConfigured} />
            </div>
          </div>
          <dl className="admin-kv-list mt-3 border-t border-slate-100 pt-3">
            <div className="admin-kv-row">
              <dt className="admin-kv-label">Awaiting dispatch</dt>
              <dd className={`admin-kv-value num ${summary.pendingDispatch > 0 ? "text-rose-600" : ""}`}>
                {summary.pendingDispatch.toLocaleString()}
              </dd>
            </div>
            <div className="admin-kv-row">
              <dt className="admin-kv-label">Supplier failures</dt>
              <dd className={`admin-kv-value num ${summary.failedSupplier > 0 ? "text-rose-600" : ""}`}>
                {summary.failedSupplier.toLocaleString()}
              </dd>
            </div>
            <div className="admin-kv-row">
              <dt className="admin-kv-label">Status polls · 24h</dt>
              <dd className="admin-kv-value num">{summary.last24h.statusPolls.toLocaleString()}</dd>
            </div>
          </dl>
        </AdminSection>

        <AdminSection
          title="Failed / stuck orders"
          description="Re-submit to Skanka5 using the same internal reference (idempotent)."
          icon={AlertTriangle}
        >
          {failed.length === 0 ? (
            <AdminEmptyState
              icon={AlertTriangle}
              title="No stuck orders"
              description="Failed supplier submissions will appear here for retry."
              tone="success"
            />
          ) : (
            <FailedOrderList orders={failed} />
          )}
        </AdminSection>
      </div>

      <AdminSection
        title={`Recent supplier events · last ${logs.length}`}
        description="Full audit trail of submits, polls, and webhooks."
        icon={Server}
      >
        <SupplierLogTable logs={logs} />
      </AdminSection>
    </AdminPageRoot>
  );
}
