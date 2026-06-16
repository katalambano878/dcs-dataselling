"use client";

import { Suspense } from "react";
import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  CreditCard,
  Crown,
  FileSpreadsheet,
  FileText,
  Flame,
  Monitor,
  Plus,
  ShoppingBag,
  Target,
  Smartphone,
  Trophy,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import type {
  VendorRecentOrder,
  VendorTodayStats,
} from "@/lib/data/vendor-agent";
import type { VendorEarningRow } from "@/lib/data/vendor-earnings";
import { RecentEarningsTable } from "@/components/vendor/recent-earnings-table";
import { BULK_SAMPLE_CSV } from "@/lib/wholesale/bulk-sample";
import { formatGHS, formatPhone } from "@/lib/format";
import { CircleProgress } from "@/components/ui/circle-progress";
import { AdminPageRoot, AdminStatTile } from "@/components/admin";
import { CheckoutSuccessBanner } from "@/components/vendor/checkout-success-banner";

interface Props {
  greeting: string;
  vendorName: string;
  balance: number;
  today: VendorTodayStats;
  recentOrders: VendorRecentOrder[];
  recentEarnings: VendorEarningRow[];
}

function downloadSample() {
  const blob = new Blob([BULK_SAMPLE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dcs-bulk-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function AgentHome({
  greeting,
  vendorName,
  balance,
  today,
  recentOrders,
  recentEarnings,
}: Props) {
  const firstName = vendorName.split(" ")[0];

  // Wallet vs target = simple visual cue. If they have ≥ ₵500 balance, ring is "full".
  const walletTarget = Math.max(balance, 500);
  const walletPct = walletTarget > 0 ? Math.min(100, (balance / walletTarget) * 100) : 0;

  return (
    <AdminPageRoot className="space-y-4">
      <Suspense fallback={null}>
        <CheckoutSuccessBanner />
      </Suspense>

      {/* Welcome */}
      <section className="welcome-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="welcome-chip">
              <span className="chip-badge">Agent</span>
              <span className="live-badge">System fully synced</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 sm:text-[13px]">
              {greeting}, {firstName} — your data reselling terminal and wallet center.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Link href="/vendor/dashboard/wholesale" className="susu-btn-gold">
              <ShoppingBag className="h-3.5 w-3.5" />
              Buy data
            </Link>
            <Link href="/vendor/dashboard/claim" className="susu-btn-gold sm:hidden">
              <Smartphone className="h-3.5 w-3.5" />
              ClaimIt
            </Link>
            <Link
              href="/vendor/dashboard/wallet?tab=paystack"
              className="susu-btn-gold hidden sm:inline-flex"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Paystack
            </Link>
            <Link href="/vendor/dashboard/wallet" className="susu-btn-ghost hidden sm:inline-flex">
              My wallet
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== VAULT HERO (wallet w/ ring) ===================== */}
      <section className="vault-hero-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1">
            <span className="vault-hero-chip">
              <Wallet className="h-3.5 w-3.5" />
              Wallet vault
            </span>
            <p className="vault-hero-label mt-4">Available balance</p>
            <p className="vault-hero-amount mt-2">{formatGHS(balance)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link
                href="/vendor/dashboard/wallet?tab=paystack"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-cyan-500/20 transition hover:brightness-105"
              >
                <CreditCard className="h-3.5 w-3.5" />
                Paystack top-up
              </Link>
              <Link
                href="/vendor/dashboard/claim"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-bold text-white shadow-md shadow-amber-500/25 transition hover:brightness-105"
              >
                <Smartphone className="h-3.5 w-3.5" />
                ClaimIt top-up
              </Link>
              <span className="vault-hero-pill-success">
                <Zap className="h-3 w-3" />
                {balance > 0 ? "Ready to sell" : "Top up to start"}
              </span>
              <div className="flex items-center gap-1.5 text-xs text-white/65">
                <span className="font-bold uppercase tracking-[0.14em] text-white/45">
                  Today
                </span>
                <span className="text-white">
                  {today.ordersToday} orders ·{" "}
                  <span className="font-bold text-amber-300">
                    {formatGHS(today.revenueToday)}
                  </span>{" "}
                  revenue
                </span>
              </div>
            </div>
          </div>

          <CircleProgress
            value={walletPct}
            label={`${Math.round(walletPct)}%`}
            caption="LOADED"
            size={108}
            stroke={9}
          />
        </div>
      </section>

      {/* ===================== 4 STAT TILES ===================== */}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <AdminStatTile
          icon={<Crown className="h-5 w-5" />}
          tone="gold"
          label="Today's revenue"
          value={formatGHS(today.revenueToday)}
          hint={`${today.ordersToday} orders today`}
          valueAccent="gold"
        />
        <AdminStatTile
          icon={<Target className="h-5 w-5" />}
          tone="sky"
          label="GB sold today"
          value={String(today.gbSoldToday)}
          hint="Across all networks"
        />
        <AdminStatTile
          icon={<Trophy className="h-5 w-5" />}
          tone="amber"
          label="Lifetime orders"
          value={String(recentOrders.length > 0 ? "Active" : "Get started")}
          hint={recentOrders.length > 0 ? "Building reputation" : "Place your first order"}
        />
        <AdminStatTile
          icon={<Wallet className="h-5 w-5" />}
          tone="violet"
          label="Wallet"
          value={formatGHS(balance)}
          hint="Available to spend"
          valueAccent="gold"
        />
      </section>

      {/* ===================== STATUS BANNER ===================== */}
      {balance > 0 ? (
        <section className="banner-success">
          <span className="banner-icon">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h4>You&apos;re ready to sell.</h4>
            <p>
              Wallet loaded with {formatGHS(balance)}. Start placing orders and
              earn commission instantly.
            </p>
          </div>
        </section>
      ) : (
        <section className="banner-info">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-200 text-blue-900">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h4 className="font-bold text-blue-900">Top up your wallet</h4>
            <p className="text-xs text-blue-800">
              Use Paystack for quick small top-ups, or ClaimIt for larger MoMo transfers without
              extra fees.
            </p>
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap gap-1.5">
            <Link href="/vendor/dashboard/wallet?tab=paystack" className="susu-btn-gold">
              <CreditCard className="h-3.5 w-3.5" />
              Paystack
            </Link>
            <Link href="/vendor/dashboard/claim" className="susu-btn-ghost">
              <Smartphone className="h-3.5 w-3.5" />
              ClaimIt
            </Link>
          </div>
        </section>
      )}

      {/* ===================== 3 MINI STATS ===================== */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <MiniTile
          icon={<Wallet className="h-4 w-4" />}
          tone="amber"
          label="Wallet"
          value={formatGHS(balance)}
        />
        <MiniTile
          icon={<Flame className="h-4 w-4" />}
          tone="rose"
          label="Streak"
          value={`${recentOrders.length > 0 ? recentOrders.length : 0}d`}
        />
        <MiniTile
          icon={<Users className="h-4 w-4" />}
          tone="sky"
          label="Networks"
          value="3"
        />
      </section>

      {/* ===================== BUY DATA QUICK LINKS ===================== */}
      <section>
        <div className="section-card-header mb-2">
          <div>
            <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
              Place an order
            </h2>
            <p className="text-xs text-slate-500">Pick a network and start selling.</p>
          </div>
          <Link
            href="/vendor/dashboard/wholesale?mode=bulk"
            className="susu-btn-ghost"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Bulk upload
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <NetworkLink
            href="/vendor/dashboard/wholesale?network=mtn"
            label="MTN"
            color="#FFCC00"
            textColor="#111"
          />
          <NetworkLink
            href="/vendor/dashboard/wholesale?network=telecel"
            label="Telecel"
            color="#E4002B"
            textColor="#fff"
          />
          <NetworkLink
            href="/vendor/dashboard/wholesale?network=at&line=ishare"
            label="AT iShare"
            color="#0066CC"
            textColor="#fff"
          />
          <NetworkLink
            href="/vendor/dashboard/wholesale?network=at&line=bigtime"
            label="AT BigTime"
            color="#0066CC"
            textColor="#fff"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <Link
            href="/vendor/dashboard/wholesale?mode=bulk"
            className="susu-btn-dark"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Excel
          </Link>
          <Link
            href="/vendor/dashboard/wholesale?mode=bulk"
            className="susu-btn-gold"
          >
            <FileText className="h-3.5 w-3.5" />
            Bulk
          </Link>
          <button
            type="button"
            onClick={downloadSample}
            className="susu-btn-ghost"
          >
            <Monitor className="h-3.5 w-3.5" />
            Sample
          </button>
        </div>
      </section>

      <RecentEarningsTable rows={recentEarnings} compact showViewAll />

      {/* ===================== RECENT ACTIVITY / PORTFOLIO ===================== */}
      <section>
        <div className="section-card-header mb-2">
          <div>
            <h2 className="text-sm font-extrabold tracking-tight text-slate-900">
              Recent activity
            </h2>
            <p className="text-xs text-slate-500">Latest orders from your terminal.</p>
          </div>
          <Link
            href="/vendor/dashboard/orders"
            className="susu-btn-ghost"
          >
            View all
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="section-card text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
              <Activity className="h-5 w-5 text-slate-400" />
            </div>
            <p className="mt-3 font-bold text-slate-900">No orders yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Place your first order above to start building your reputation.
            </p>
          </div>
        ) : (
          <div className="grid gap-2 sm:gap-3 md:grid-cols-2">
            {recentOrders.slice(0, 4).map((o) => (
              <div key={o.id} className="section-card">
                <div className="section-card-header">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="tile-icon-gold flex h-10 w-10 items-center justify-center rounded-xl">
                      <ShoppingBag className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {o.reference}
                      </p>
                      <p className="text-xs text-slate-500">
                        {o.network} · {formatPhone(o.phone)}
                      </p>
                    </div>
                  </div>
                  <span className="susu-pill susu-pill-active">
                    <span className="dot" />
                    Done
                  </span>
                </div>
                <div className="substat-row">
                  <div className="substat">
                    <p className="substat-label">Amount</p>
                    <p className="substat-value">{formatGHS(o.amount)}</p>
                  </div>
                  <div className="substat">
                    <p className="substat-label">Network</p>
                    <p className="substat-value">{o.network}</p>
                  </div>
                  <div className="substat">
                    <p className="substat-label">Status</p>
                    <p className="substat-value text-emerald-700">Sent</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </AdminPageRoot>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function MiniTile({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "amber" | "rose" | "sky" | "emerald" | "violet" | "gold" | "slate";
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 sm:p-3">
      <div className="flex items-center gap-2">
        <div className={`stat-tile-icon tile-icon-${tone} !h-7 !w-7`}>{icon}</div>
        <div>
          <p className="stat-tile-label text-[9px]">{label}</p>
          <p className="text-sm font-extrabold leading-none text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function NetworkLink({
  href,
  label,
  color,
  textColor,
}: {
  href: string;
  label: string;
  color: string;
  textColor: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-[0_6px_18px_rgba(10,46,93,0.07)]"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-lg text-[10px] font-black shadow-sm"
        style={{ backgroundColor: color, color: textColor }}
      >
        {label.slice(0, 3).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900">{label}</p>
        <p className="text-[11px] text-slate-500">Browse bundles →</p>
      </div>
    </Link>
  );
}
