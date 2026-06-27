"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Package,
  Wallet,
  MoreHorizontal,
  ShoppingCart,
  LayoutGrid,
  FileText,
  Activity,
  Store,
  Gift,
  Heart,
  DollarSign,
  Tags,
  TrendingUp,
  MessageSquare,
  Code,
  Shield,
  User,
  Menu,
  Monitor,
  Smartphone,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { signOut } from "@/app/auth/actions";
import { DcsLogo } from "@/components/brand/dcs-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AgentFabStack } from "@/components/vendor/agent-fab-stack";
import { useVendorCart } from "@/components/vendor/vendor-cart-context";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/constants";

const BOTTOM_NAV = [
  { href: "/vendor/dashboard", label: "Home", icon: Home, match: (p: string) => p === "/vendor/dashboard" },
  {
    href: "/vendor/dashboard/orders",
    label: "Orders",
    icon: Package,
    match: (p: string) => p.startsWith("/vendor/dashboard/orders"),
  },
  {
    href: "/vendor/dashboard/wallet",
    label: "Wallet",
    icon: Wallet,
    match: (p: string) =>
      p.startsWith("/vendor/dashboard/wallet") ||
      p.startsWith("/vendor/dashboard/transactions"),
  },
  { href: "#sidebar", label: "More", icon: MoreHorizontal, match: () => false },
] as const;

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
  badge?: string | number;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/vendor/dashboard", label: "Dashboard", icon: LayoutGrid, match: (p) => p === "/vendor/dashboard" },
      { href: "/vendor/dashboard/orders", label: "Orders", icon: FileText, match: (p) => p.startsWith("/vendor/dashboard/orders") },
      {
        href: "/vendor/dashboard/wallet",
        label: "Wallet",
        icon: Wallet,
        match: (p) =>
          p.startsWith("/vendor/dashboard/wallet") ||
          p.startsWith("/vendor/dashboard/transactions"),
      },
      {
        href: "/vendor/dashboard/claim",
        label: "ClaimIt",
        icon: Smartphone,
        match: (p) => p.startsWith("/vendor/dashboard/claim"),
      },
      { href: "/vendor/dashboard/wholesale", label: "Buy Data", icon: ShoppingCart, match: (p) => p.startsWith("/vendor/dashboard/wholesale") },
      { href: "/vendor/dashboard/wishlist", label: "Wishlist", icon: Heart, match: (p) => p.startsWith("/vendor/dashboard/wishlist") },
      { href: "/vendor/dashboard/catalogue", label: "My Prices", icon: Tags, match: (p) => p.startsWith("/vendor/dashboard/catalogue") },
      { href: "/vendor/dashboard/earnings", label: "Earnings", icon: TrendingUp, match: (p) => p.startsWith("/vendor/dashboard/earnings") },
      { href: "/vendor/dashboard/storefront", label: "Storefront", icon: Store, match: (p) => p.startsWith("/vendor/dashboard/storefront") },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/vendor/dashboard/referrals", label: "Referrals", icon: Gift, match: (p) => p.startsWith("/vendor/dashboard/referrals") },
      { href: "/vendor/dashboard/rewards", label: "Rewards", icon: Gift, match: (p) => p === "/vendor/dashboard/rewards" },
      { href: "/vendor/dashboard/rewards#withdraw", label: "Reward Withdrawal", icon: DollarSign, match: (p) => p.startsWith("/vendor/dashboard/rewards") },
      { href: "/vendor/dashboard/complaints", label: "My Complaints", icon: MessageSquare, match: (p) => p.startsWith("/vendor/dashboard/complaints") },
    ],
  },
  {
    title: "Extra services",
    items: [
      { href: "/vendor/dashboard/developer", label: "Developer", icon: Code, match: (p) => p.startsWith("/vendor/dashboard/developer") },
      { href: `${SITE.consoleUrl}/console`, label: "Data Console", icon: Monitor, match: () => false },
      { href: "/vendor/dashboard/mtn-afa", label: "MTN AFA", icon: Shield, match: (p) => p.startsWith("/vendor/dashboard/mtn-afa") },
      { href: "/vendor/dashboard/profile", label: "Profile", icon: User, match: (p) => p.startsWith("/vendor/dashboard/profile") },
    ],
  },
];

interface AgentShellProps {
  vendorName: string;
  businessName: string;
  tier: string;
  children: React.ReactNode;
  supportWhatsApp?: string;
  whatsappChannelUrl?: string;
}

function pageTitleFromPath(pathname: string): string {
  if (pathname === "/vendor/dashboard") return "Dashboard";
  if (pathname.startsWith("/vendor/dashboard/claim")) return "ClaimIt";
  const segs = pathname.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  if (!last) return "Dashboard";
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AgentSidebarNav({
  pathname,
  cartCount,
  vendorName,
  businessName,
  tier,
  onNavigate,
}: {
  pathname: string;
  cartCount: number;
  vendorName: string;
  businessName: string;
  tier: string;
  onNavigate?: () => void;
}) {
  void tier;
  const tierBadgeClass =
    tier === "Pro Agent"
      ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
      : tier === "Super Agent"
        ? "border border-amber-400/30 bg-amber-500/10 text-amber-300"
        : "border border-white/10 bg-white/5 text-white/65";
  return (
    <>
      {/* User chip */}
      <div className="border-b border-white/6 p-3">
        <div className="admin-user-chip">
          <div className="avatar">{vendorName.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{vendorName}</p>
            <p className="truncate text-[11px] text-white/55">{businessName}</p>
            <span
              className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tierBadgeClass}`}
            >
              {tier}
            </span>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="nav-section-label mb-2 px-3">{section.title}</p>
            <ul className="space-y-0.5">
              {section.title === "Extra services" && (
                <li>
                  <Link
                    href="/vendor/dashboard/wholesale?cart=1"
                    onClick={onNavigate}
                    className="nav-link relative"
                  >
                    <ShoppingCart className="nav-icon" />
                    <span className="flex-1">Cart</span>
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/15 px-1.5 text-[10px] font-black text-amber-300">
                      {cartCount}
                    </span>
                  </Link>
                </li>
              )}
              {section.items.map((item) => {
                const active = item.match(pathname);
                return (
                  <li key={item.href + item.label}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      className={cn("nav-link", active && "nav-link-active")}
                    >
                      <item.icon className="nav-icon" />
                      <span className="truncate">{item.label}</span>
                      {item.badge != null && (
                        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-rose-500" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/6 p-3">
        <Link
          href="/"
          className="mb-1 block rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 hover:bg-white/5 hover:text-white"
        >
          View storefront
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
          >
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}

function AgentSidebar({
  pathname,
  cartCount,
  vendorName,
  businessName,
  tier,
  onNavigate,
  className,
}: {
  pathname: string;
  cartCount: number;
  vendorName: string;
  businessName: string;
  tier: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "admin-sidebar flex h-full w-56 flex-col border-r",
        className,
      )}
    >
      <Link
        href="/vendor/dashboard"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/6 px-3.5"
      >
        <span className="flex items-center gap-2">
          <DcsLogo size={24} className="max-w-full" />
          <span className="text-xs font-extrabold tracking-tight text-white">
            DCS Elite
          </span>
        </span>
        <ChevronLeft className="h-4 w-4 text-white/40 lg:hidden" />
      </Link>
      <AgentSidebarNav
        pathname={pathname}
        cartCount={cartCount}
        vendorName={vendorName}
        businessName={businessName}
        tier={tier}
        onNavigate={onNavigate}
      />
    </aside>
  );
}

export function AgentShell({
  vendorName,
  businessName,
  tier,
  children,
  supportWhatsApp,
  whatsappChannelUrl,
}: AgentShellProps) {
  const pathname = usePathname();
  const { count: cartCount } = useVendorCart();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const openSidebar = () => setSidebarOpen(true);
  const closeSidebar = () => setSidebarOpen(false);

  const title = pageTitleFromPath(pathname);

  return (
    <div className="dashboard-compact admin-vault-theme flex min-h-screen flex-col lg:flex-row">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <AgentSidebar
          pathname={pathname}
          cartCount={cartCount}
          vendorName={vendorName}
          businessName={businessName}
          tier={tier}
        />
      </div>

      <div className="flex flex-1 flex-col lg:pl-56">
        {/* Top bar */}
        <header className="admin-topbar sticky top-0 z-30 border-b">
          <div className="flex h-14 items-center gap-2.5 px-3 sm:px-5 lg:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-white/55 hover:bg-white/5 lg:hidden"
              onClick={openSidebar}
              aria-label="Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
              {title}
            </h1>

            <div className="ml-auto flex items-center gap-1.5">
              <NotificationBell apiUrl="/api/vendor/notifications" variant="dark" />
              <Link
                href="/vendor/dashboard/wholesale?cart=1"
                className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-amber-400 text-navy-950 shadow-md shadow-amber-500/25 lg:hidden"
                aria-label="Cart"
              >
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#061528] bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {cartCount}
                  </span>
                )}
              </Link>
              <div className="admin-user-chip hidden h-8 items-center gap-1.5 px-2 py-1 sm:flex">
                <div className="avatar !h-6 !w-6 !text-[10px]">
                  {vendorName.slice(0, 2).toUpperCase()}
                </div>
                <span className="text-xs font-bold text-white">
                  {vendorName.split(" ")[0]}
                </span>
              </div>
            </div>
          </div>
        </header>

        <main className="relative flex-1 pb-24 lg:pb-6">
          {children}
          <AgentFabStack
            supportWhatsApp={supportWhatsApp}
            whatsappChannelUrl={whatsappChannelUrl}
          />
        </main>

        {/* Mobile bottom nav */}
        <nav className="admin-topbar vendor-mobile-nav fixed bottom-0 left-0 right-0 z-40 border-t lg:hidden">
          <ul className="grid grid-cols-4">
            {BOTTOM_NAV.map((item) => {
              const active =
                item.href === "#sidebar" ? sidebarOpen : item.match(pathname);
              const inner = (
                <>
                  <div
                    className={cn(
                      "relative flex h-7 w-7 items-center justify-center rounded-lg transition",
                      active && "bg-amber-500/15",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-4 w-4",
                        active ? "text-amber-300" : "text-white/45",
                      )}
                    />
                  </div>
                  <span
                    className={cn(
                      "text-[9px] font-bold uppercase tracking-wider",
                      active ? "text-amber-300" : "text-white/45",
                    )}
                  >
                    {item.label}
                  </span>
                </>
              );
              if (item.href === "#sidebar") {
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={openSidebar}
                      className="flex w-full flex-col items-center gap-1 py-2"
                    >
                      {inner}
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link href={item.href} className="flex flex-col items-center gap-1 py-2">
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={closeSidebar}
          />
          <div className="absolute left-0 top-0 h-full">
            <AgentSidebar
              pathname={pathname}
              cartCount={cartCount}
              vendorName={vendorName}
              businessName={businessName}
              tier={tier}
              onNavigate={closeSidebar}
              className="h-full w-[min(15rem,85vw)] shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
}
