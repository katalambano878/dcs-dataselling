import { CheckCircle2, Clock, ShieldAlert, Store, UserPlus } from "lucide-react";
import {
  AdminConfigError,
  AdminDataTable,
  AdminEmptyState,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
  AdminStatGrid,
  AdminStatTile,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import {
  fetchAdminVendors,
  fetchPendingRegistrations,
  type PendingRegistrationRow,
  type RegistrationStage,
} from "@/lib/data/admin-queries";
import { getAgentTierSettings } from "@/lib/data/tier-settings";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import { formatTierRolesSummary } from "@/lib/vendor/tier-rules";
import { getTierConfigFromSettings, VENDOR_TIERS } from "@/lib/vendor/tiers";
import { Badge } from "@/components/ui/badge";
import { formatCompact, formatGHS } from "@/lib/format";
import { GrantApiButton } from "./grant-api-button";
import { RecalculateTiersButton } from "./recalculate-tiers-button";
import { TierRolesEditor } from "./tier-roles-editor";
import { VendorActions } from "./vendor-actions";
import { VendorAgentMenu } from "./vendor-agent-menu";
import type { VendorStatus, VendorTier } from "@/types";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<
  VendorStatus,
  "success" | "warning" | "danger" | "neutral" | "default"
> = {
  approved: "success",
  pending: "warning",
  suspended: "danger",
  rejected: "danger",
};

const TIER_VARIANT: Record<VendorTier, "neutral" | "default" | "success" | "warning"> = {
  starter: "neutral",
  verified: "default",
  pro: "success",
  express: "warning",
};

const STAGE_META: Record<
  RegistrationStage,
  { label: string; variant: "warning" | "default" | "neutral"; hint: string }
> = {
  paid_awaiting_store: {
    label: "Paid · awaiting store",
    variant: "warning",
    hint: "Paid the setup fee but never submitted their store. Reach out so they can finish.",
  },
  setup_started: {
    label: "Setup started",
    variant: "default",
    hint: "Began the store wizard but has not paid the setup fee yet.",
  },
  account_only: {
    label: "Account only",
    variant: "neutral",
    hint: "Created an account but has not started the store wizard.",
  },
};

function formatRegisteredAt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AdminVendorsPage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const [vendors, tierSettings, registrations] = await Promise.all([
    fetchAdminVendors(),
    getAgentTierSettings(),
    fetchPendingRegistrations(),
  ]);

  const pending = vendors.filter((v) => v.status === "pending");
  const approved = vendors.filter((v) => v.status === "approved");
  const other = vendors.filter(
    (v) => v.status !== "pending" && v.status !== "approved",
  );
  const proCount = vendors.filter((v) => v.tier === "pro").length;
  const superCount = vendors.filter((v) => v.tier === "verified").length;
  const paidAwaiting = registrations.filter(
    (r) => r.stage === "paid_awaiting_store",
  ).length;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Vendor governance"
        description="Approve agents, assign roles, and manage platform access."
        meta={`${vendors.length} vendors · ${pending.length} pending approval · ${registrations.length} sign-ups without a store`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <RecalculateTiersButton />
          </div>
        }
      />

      <AdminStatGrid className="lg:grid-cols-6">
        <AdminStatTile
          icon={<UserPlus className="h-4 w-4" />}
          tone={paidAwaiting > 0 ? "amber" : "sky"}
          label="New sign-ups"
          value={String(registrations.length)}
        />
        <AdminStatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          label="Approved"
          value={String(approved.length)}
          valueAccent="emerald"
        />
        <AdminStatTile
          icon={<Clock className="h-4 w-4" />}
          tone="amber"
          label="Pending"
          value={String(pending.length)}
        />
        <AdminStatTile
          icon={<ShieldAlert className="h-4 w-4" />}
          tone="rose"
          label="Suspended / rejected"
          value={String(other.length)}
        />
        <AdminStatTile
          icon={<Store className="h-4 w-4" />}
          tone="sky"
          label="Super Agents"
          value={String(superCount)}
        />
        <AdminStatTile
          icon={<Store className="h-4 w-4" />}
          tone="emerald"
          label="Pro Agents"
          value={String(proCount)}
          valueAccent="emerald"
        />
      </AdminStatGrid>

      <AdminSection
        title="Agent role pricing"
        description="Set platform fee, rewards, and promotion thresholds for each agent role."
      >
        <TierRolesEditor initialSettings={tierSettings} />
      </AdminSection>

      <AdminSection title="Role summary" description={formatTierRolesSummary(tierSettings)}>
        <div className="grid gap-2 sm:grid-cols-3">
          {VENDOR_TIERS.map((tierId) => {
            const tier = getTierConfigFromSettings(tierId, tierSettings);
            return (
              <div key={tierId} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <p className="text-sm font-bold text-foreground">{tier.label}</p>
                <p className="mt-1 text-xs text-muted">{tier.description}</p>
                <p className="mt-2 text-xs text-foreground">
                  {tier.commissionRate}% platform fee · {Math.round(tier.rewardRate * 100)}% rewards · min{" "}
                  {formatGHS(tier.minWithdrawal)} withdrawal
                </p>
              </div>
            );
          })}
        </div>
      </AdminSection>

      <AdminSection
        title="New sign-ups — no store yet"
        description="Accounts that registered but never finished creating a store, so they don't appear in the vendors list below. Anyone marked “Paid · awaiting store” already paid the setup fee — follow up so they can complete onboarding. Use “Grant API access” to give a no-store account developer API access; it then appears in the vendors list where you can assign a role."
        icon={UserPlus}
      >
        {registrations.length === 0 ? (
          <AdminEmptyState
            icon={UserPlus}
            title="No pending sign-ups"
            description="Everyone who registered has completed a store. New registrations without a store will appear here."
          />
        ) : (
          <AdminDataTable minWidth="820px">
            <AdminTableHead>
              <AdminTh>Account</AdminTh>
              <AdminTh>Contact</AdminTh>
              <AdminTh>Registered</AdminTh>
              <AdminTh>Stage</AdminTh>
              <AdminTh>Intended store</AdminTh>
              <AdminTh>Action</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {registrations.map((r: PendingRegistrationRow) => {
                const stage = STAGE_META[r.stage];
                return (
                  <AdminTr key={r.userId}>
                    <AdminTd>
                      <p className="font-medium text-foreground">
                        {r.fullName?.trim() || r.email.split("@")[0]}
                      </p>
                      <a
                        href={`mailto:${r.email}`}
                        className="text-xs text-muted underline-offset-2 hover:underline"
                      >
                        {r.email}
                      </a>
                    </AdminTd>
                    <AdminTd>
                      {r.phone ? (
                        <a
                          href={`tel:${r.phone}`}
                          className="text-xs text-foreground underline-offset-2 hover:underline"
                        >
                          {r.phone}
                        </a>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs text-muted">
                        {formatRegisteredAt(r.registeredAt)}
                      </span>
                    </AdminTd>
                    <AdminTd>
                      <Badge variant={stage.variant}>{stage.label}</Badge>
                      <p className="mt-0.5 max-w-[260px] text-[10px] leading-tight text-muted">
                        {stage.hint}
                      </p>
                    </AdminTd>
                    <AdminTd>
                      {r.intendedBusinessName ? (
                        <>
                          <p className="text-xs font-medium text-foreground">
                            {r.intendedBusinessName}
                          </p>
                          {r.intendedSlug && (
                            <p className="text-[10px] text-muted">/{r.intendedSlug}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-muted">Not started</span>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <GrantApiButton userId={r.userId} />
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminSection>

      <AdminSection title="All vendors" description="Live stores, roles, and onboarding status." icon={Store}>
        {vendors.length === 0 ? (
          <AdminEmptyState
            icon={Store}
            title="No vendors yet"
            description="Agents appear here after they submit a store application."
          />
        ) : (
          <AdminDataTable minWidth="860px">
            <AdminTableHead>
              <AdminTh>Vendor</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Role</AdminTh>
              <AdminTh>Onboarding</AdminTh>
              <AdminTh>Orders</AdminTh>
              <AdminTh>Rating</AdminTh>
              <AdminTh>Actions</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {vendors.map((v) => {
                const tierConfig = getTierConfigFromSettings(v.tier, tierSettings);
                return (
                  <AdminTr key={v.id}>
                    <AdminTd>
                      <VendorAgentMenu
                        vendorId={v.id}
                        businessName={v.business_name}
                        slug={v.slug}
                        status={v.status}
                        tier={v.tier ?? "starter"}
                        tierLabels={tierSettings.tiers}
                      />
                      <p className="text-xs text-muted">/{v.slug}</p>
                    </AdminTd>
                    <AdminTd>
                      <Badge variant={STATUS_VARIANT[v.status]}>{v.status}</Badge>
                      {v.api_only && (
                        <Badge className="ml-1" variant="default">
                          API only
                        </Badge>
                      )}
                      {v.featured && (
                        <Badge className="ml-1" variant="default">
                          featured
                        </Badge>
                      )}
                    </AdminTd>
                    <AdminTd>
                      <Badge variant={TIER_VARIANT[v.tier]}>{tierConfig.label}</Badge>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {v.commission_rate}% fee · {Math.round(tierConfig.rewardRate * 100)}% rewards
                        {v.tier_manual ? " · manual" : ""}
                      </p>
                    </AdminTd>
                    <AdminTd>
                      <span className="text-xs capitalize text-muted">
                        {v.api_only
                          ? v.status === "approved"
                            ? "API active"
                            : "API pending"
                          : v.status === "approved"
                            ? "Live"
                            : (v.kyc_status?.replace(/_/g, " ") ?? "—")}
                      </span>
                    </AdminTd>
                    <AdminTd className="num">{formatCompact(v.total_orders)}</AdminTd>
                    <AdminTd>
                      <span className="num font-medium">{Number(v.rating).toFixed(1)}</span>
                      <span className="text-xs text-muted"> · ~{v.fulfilment_minutes}m</span>
                    </AdminTd>
                    <AdminTd>
                      <VendorActions
                        vendorId={v.id}
                        slug={v.slug}
                        status={v.status}
                        featured={v.featured}
                        tier={v.tier ?? "starter"}
                        tierManual={v.tier_manual ?? false}
                        tierLabels={tierSettings.tiers}
                        apiOnly={v.api_only}
                      />
                    </AdminTd>
                  </AdminTr>
                );
              })}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminSection>
    </AdminPageRoot>
  );
}
