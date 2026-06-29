"use client";

import { useEffect, useState } from "react";
import { Activity, Database, Send, Tag } from "lucide-react";
import { AdminStatGrid, AdminStatTile } from "@/components/admin";
import { formatConsoleData } from "@/lib/console/units";

interface DashboardStats {
  balanceMb: number;
  totalSends: number;
  sentTodayCount: number;
  sentTodayMb: number;
  enabled: boolean;
}

interface PricingTier {
  name: string;
  priceLabel: string;
}

interface Props {
  initialStats: DashboardStats;
  initialPricing: PricingTier | null;
}

export function ConsoleDashboardLive({ initialStats, initialPricing }: Props) {
  const [stats, setStats] = useState(initialStats);
  const [pricing, setPricing] = useState(initialPricing);

  useEffect(() => {
    async function refresh() {
      try {
        const res = await fetch("/api/console/stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as {
          stats?: DashboardStats;
          pricing?: PricingTier | null;
        };
        if (data.stats) setStats(data.stats);
        if (data.pricing !== undefined) setPricing(data.pricing);
      } catch {
        /* ignore polling errors */
      }
    }

    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <AdminStatGrid className="lg:grid-cols-2 xl:grid-cols-4">
      <AdminStatTile
        icon={<Database className="h-4 w-4" />}
        tone="amber"
        label="Bundle balance"
        value={formatConsoleData(stats.balanceMb)}
        hint={stats.enabled ? "Available to send" : "Awaiting admin credit"}
      />
      <AdminStatTile
        icon={<Activity className="h-4 w-4" />}
        tone="sky"
        label="Transactions made"
        value={String(stats.totalSends)}
        hint="All-time console sends"
      />
      <AdminStatTile
        icon={<Send className="h-4 w-4" />}
        tone="emerald"
        label="Data sent today"
        value={formatConsoleData(stats.sentTodayMb)}
        hint={`${stats.sentTodayCount} send${stats.sentTodayCount === 1 ? "" : "s"} today`}
      />
      <AdminStatTile
        icon={<Tag className="h-4 w-4" />}
        tone="violet"
        label="Pricing tier"
        value={pricing?.name ?? "—"}
        hint={pricing?.priceLabel ?? "Contact admin for tier assignment"}
      />
    </AdminStatGrid>
  );
}
