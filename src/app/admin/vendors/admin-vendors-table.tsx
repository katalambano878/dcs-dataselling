"use client";

import { useMemo, useState } from "react";
import { Search, Store } from "lucide-react";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatCompact } from "@/lib/format";
import type { AdminVendorRow } from "@/lib/data/admin-queries";
import type { AgentTierSettings } from "@/lib/vendor/tier-settings-types";
import { getTierConfigFromSettings } from "@/lib/vendor/tiers";
import type { VendorStatus, VendorTier } from "@/types";
import { VendorActions } from "./vendor-actions";
import { VendorAgentMenu } from "./vendor-agent-menu";

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

function matchesVendorSearch(vendor: AdminVendorRow, raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  if (!needle) return true;

  const fields = [
    vendor.business_name,
    vendor.slug,
    vendor.full_name ?? "",
    vendor.email ?? "",
    vendor.phone ?? "",
  ].map((f) => f.toLowerCase());

  if (fields.some((f) => f.includes(needle))) return true;

  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return false;

  const blob = fields.join(" ");
  return tokens.every((t) => blob.includes(t));
}

interface Props {
  vendors: AdminVendorRow[];
  tierSettings: AgentTierSettings;
}

export function AdminVendorsTable({ vendors, tierSettings }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => vendors.filter((v) => matchesVendorSearch(v, search)),
    [vendors, search],
  );

  return (
    <AdminSection title="All vendors" description="Live stores, roles, and onboarding status." icon={Store}>
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground">
          Search vendors
          <div className="relative mt-1.5 max-w-xl">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="h-10 pl-9"
              placeholder="Store name, surname, email, or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </label>
        {search.trim() ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {filtered.length} of {vendors.length} vendor{vendors.length === 1 ? "" : "s"} match
          </p>
        ) : null}
      </div>

      {vendors.length === 0 ? (
        <AdminEmptyState
          icon={Store}
          title="No vendors yet"
          description="Agents appear here after they submit a store application."
        />
      ) : filtered.length === 0 ? (
        <AdminEmptyState
          icon={Search}
          title="No matches"
          description={`No vendor matches "${search.trim()}". Try a store name, surname, email, or slug.`}
        />
      ) : (
        <AdminDataTable minWidth="920px">
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
            {filtered.map((v) => {
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
                    {v.full_name?.trim() ? (
                      <p className="text-xs text-muted-foreground">{v.full_name.trim()}</p>
                    ) : null}
                    {v.email ? (
                      <a
                        href={`mailto:${v.email}`}
                        className="text-xs text-muted underline-offset-2 hover:underline"
                      >
                        {v.email}
                      </a>
                    ) : null}
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
  );
}
