import Link from "next/link";
import {
  Cable,
  Construction,
  Database,
  DollarSign,
  MessageSquare,
  Package,
  Settings,
  Store,
} from "lucide-react";
import {
  AdminIntegrationList,
  AdminIntegrationRow,
  AdminKvList,
  AdminKvRow,
  AdminPageIntro,
  AdminPageRoot,
  AdminQuickLink,
  AdminQuickLinks,
  AdminSection,
} from "@/components/admin";
import { SITE } from "@/lib/constants";
import { getPlatformConfig } from "@/lib/data/platform-config";
import { DEFAULT_PLATFORM_CONFIG } from "@/lib/platform/config-types";
import { isArkeselConfigured } from "@/lib/notifications/arkesel";
import { isSkanka5Configured } from "@/lib/suppliers/skanka5";
import { isSuccessBizHubConfigured } from "@/lib/suppliers/successbizhub";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { PlatformConfigEditor } from "./platform-config-editor";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabaseOk = hasSupabaseConfig();
  const paystackOk = Boolean(process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_"));
  const arkeselOk = isArkeselConfigured();
  const skanka5Ok = isSkanka5Configured();
  const successBizHubOk = isSuccessBizHubConfigured();
  const skanka5WebhookOk = Boolean(process.env.SKANKA5_WEBHOOK_SECRET);
  const platformConfig = supabaseOk
    ? await getPlatformConfig()
    : DEFAULT_PLATFORM_CONFIG;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Platform config"
        description="Brand identity, integration health, and admin shortcuts."
        meta={`${[supabaseOk, paystackOk, arkeselOk, skanka5Ok].filter(Boolean).length}/4 core integrations connected`}
      />

      {platformConfig.maintenanceMode ? (
        <AdminSection
          title="Maintenance mode is ON"
          description="The public site and vendor dashboard are hidden. Turn it off below when you're ready to go live again."
          icon={Construction}
        >
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Visitors are redirected to{" "}
            <a href="/maintenance" className="font-semibold underline" target="_blank" rel="noreferrer">
              /maintenance
            </a>
            . Admin and webhooks remain active.
          </p>
        </AdminSection>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <AdminSection title="Brand" description="Public-facing platform identity." icon={Settings}>
          <AdminKvList>
            <AdminKvRow label="Platform name" value={SITE.name} />
            <AdminKvRow label="Domain" value={SITE.domain} />
            <AdminKvRow label="Public URL" value={SITE.url} />
            <AdminKvRow label="Support email" value={SITE.supportEmail} />
            <AdminKvRow label="Support WhatsApp" value={SITE.supportWhatsApp} />
          </AdminKvList>
        </AdminSection>

        <AdminSection
          title="Integrations"
          description="Environment-driven services — configure via .env.local or Vercel."
          icon={Cable}
        >
          <AdminIntegrationList>
            <AdminIntegrationRow label="Supabase" ok={supabaseOk} />
            <AdminIntegrationRow
              label="Paystack"
              ok={paystackOk}
              hint="Set PAYSTACK_SECRET_KEY in .env.local"
            />
            <AdminIntegrationRow
              label="Arkesel SMS"
              ok={arkeselOk}
              hint="Set ARKESEL_API_KEY and ARKESEL_SENDER_ID"
            />
            <AdminIntegrationRow
              label="Skanka5 supplier"
              ok={skanka5Ok}
              hint="Set SKANKA5_API_KEY and SKANKA5_NETWORK_ID_MTN"
            />
            <AdminIntegrationRow
              label="Skanka5 webhook signing"
              ok={skanka5WebhookOk}
              hint="Set SKANKA5_WEBHOOK_SECRET to verify supplier callbacks"
            />
            <AdminIntegrationRow
              label="Success Biz Hub supplier"
              ok={successBizHubOk}
              hint="Set SUCCESSBIZHUB_API_KEY and offer slugs; route via SUPPLIER_FOR_*"
            />
          </AdminIntegrationList>
        </AdminSection>
      </div>

      <AdminSection
        title="Vendor onboarding fees"
        description="Control the one-time activation fee every new agent pays before their store goes live."
        icon={DollarSign}
      >
        <PlatformConfigEditor initialConfig={platformConfig} />
      </AdminSection>

      <AdminSection title="Quick links" description="Jump to operational admin tools." icon={Database}>
        <AdminQuickLinks>
          <AdminQuickLink href="/admin/wholesale" icon={Package} label="Wholesale catalogue" />
          <AdminQuickLink href="/admin/vendors" icon={Store} label="Vendor governance" />
          <AdminQuickLink href="/admin/sms-debugger" icon={MessageSquare} label="SMS debugger" />
          <AdminQuickLink href="/admin/supplier" icon={Cable} label="Supplier (Skanka5) console" />
        </AdminQuickLinks>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          Payment keys and service role secrets are managed via environment variables only — never
          commit <code className="rounded bg-slate-100 px-1">.env.local</code>.{" "}
          <Link href="/admin/supplier" className="font-semibold text-amber-800 hover:underline">
            Open supplier console
          </Link>{" "}
          for env var diagnostics.
        </p>
      </AdminSection>
    </AdminPageRoot>
  );
}
