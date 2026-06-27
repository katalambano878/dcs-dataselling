"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  FileText,
  Activity,
  ShoppingCart,
  Smartphone,
  Store,
  Gift,
  DollarSign,
  MessageSquare,
  Tag,
  Code,
  Shield,
  User,
  Menu,
  ShieldCheck,
  AlertTriangle,
  BarChart3,
  Settings,
  Layers,
  MessageCircle,
  Monitor,
  Cable,
  Heart,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { DcsLogo } from "@/components/brand/dcs-logo";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutGrid, match: (p) => p === "/admin" },
      { href: "/admin/orders", label: "Orders", icon: FileText, match: (p) => p.startsWith("/admin/orders") },
      { href: "/admin/transactions", label: "Transactions", icon: Activity, match: (p) => p.startsWith("/admin/transactions") },
      { href: "/admin/momo-payments", label: "MoMo Payments", icon: Smartphone, match: (p) => p.startsWith("/admin/momo-payments") },
      { href: "/admin/wholesale", label: "Checkout", icon: ShoppingCart, match: (p) => p.startsWith("/admin/wholesale") },
      { href: "/admin/consoles", label: "Data Consoles", icon: Monitor, match: (p) => p.startsWith("/admin/consoles") },
      { href: "/admin/wishlist", label: "Wishlist", icon: Heart, match: (p) => p.startsWith("/admin/wishlist") },
      { href: "/admin/vendors", label: "Store", icon: Store, match: (p) => p.startsWith("/admin/vendors") },
    ],
  },
  {
    title: "Agent ops",
    items: [
      { href: "/admin/agent-ops#rewards", label: "Rewards", icon: Gift, match: (p) => p.startsWith("/admin/agent-ops") },
      { href: "/admin/agent-ops#withdrawals", label: "Reward Withdrawals", icon: DollarSign, match: (p) => p.startsWith("/admin/agent-ops") },
      { href: "/admin/agent-ops#complaints", label: "Agent Complaints", icon: MessageSquare, match: (p) => p.startsWith("/admin/agent-ops") },
    ],
  },
  {
    title: "Extra services",
    items: [
      { href: "/admin/momo-payments", label: "ClaimIt", icon: Tag, match: (p) => p.startsWith("/admin/momo-payments") },
      { href: "/admin/agent-ops#developer", label: "Developer", icon: Code, match: (p) => p.startsWith("/admin/agent-ops") },
      { href: "/admin/agent-ops#mtn-afa", label: "MTN AFA", icon: Shield, match: (p) => p.startsWith("/admin/agent-ops") },
      { href: "/admin/vendors", label: "Agent Profiles", icon: User, match: (p) => p.startsWith("/admin/vendors") },
    ],
  },
  {
    title: "Platform",
    items: [
      { href: "/admin/operations", label: "Operations", icon: ShieldCheck, match: (p) => p.startsWith("/admin/operations") },
      { href: "/admin/disputes", label: "Disputes", icon: AlertTriangle, match: (p) => p.startsWith("/admin/disputes") },
      { href: "/admin/promotions", label: "Customer Promotions", icon: Layers, match: (p) => p.startsWith("/admin/promotions") },
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3, match: (p) => p.startsWith("/admin/analytics") },
      { href: "/admin/sms-debugger", label: "SMS Debugger", icon: MessageCircle, match: (p) => p.startsWith("/admin/sms-debugger") },
      { href: "/admin/supplier", label: "Supplier Console", icon: Cable, match: (p) => p.startsWith("/admin/supplier") },
      { href: "/admin/settings", label: "Settings", icon: Settings, match: (p) => p.startsWith("/admin/settings") },
      { href: "/admin/profile", label: "My Profile", icon: User, match: (p) => p.startsWith("/admin/profile") },
    ],
  },
];

interface AdminShellProps {
  adminName: string;
  adminRole: string;
  children: React.ReactNode;
}

function pageTitleFromPath(pathname: string): string {
  if (pathname === "/admin") return "Dashboard";
  const segs = pathname.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  if (!last) return "Admin";
  return last
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function AdminSidebarNav({
  pathname,
  adminName,
  adminRole,
  onNavigate,
}: {
  pathname: string;
  adminName: string;
  adminRole: string;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* User chip */}
      <div className="border-b border-white/6 p-3">
        <Link href="/admin/profile" onClick={onNavigate} className="admin-user-chip block transition hover:bg-white/5">
          <div className="avatar">{adminName.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{adminName}</p>
            <p className="truncate text-[11px] text-white/55">{adminRole}</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="nav-section-label mb-2 px-3">{section.title}</p>
            <ul className="space-y-0.5">
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
          Exit to store
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

function AdminSidebar({
  pathname,
  adminName,
  adminRole,
  onNavigate,
  className,
}: {
  pathname: string;
  adminName: string;
  adminRole: string;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("admin-sidebar flex h-full w-56 flex-col border-r", className)}>
      <Link
        href="/admin"
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2 border-b border-white/6 px-3.5"
      >
        <DcsLogo size={24} className="max-w-full" />
        <span className="text-xs font-extrabold tracking-tight text-white">
          DCS Elite
        </span>
      </Link>
      <AdminSidebarNav
        pathname={pathname}
        adminName={adminName}
        adminRole={adminRole}
        onNavigate={onNavigate}
      />
    </aside>
  );
}

export function AdminShell({ adminName, adminRole, children }: AdminShellProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [time, setTime] = useState<string>(() =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  );

  useEffect(() => {
    const id = setInterval(
      () =>
        setTime(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
      30000,
    );
    return () => clearInterval(id);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);
  const title = pageTitleFromPath(pathname);

  return (
    <div className="dashboard-compact admin-vault-theme flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <AdminSidebar pathname={pathname} adminName={adminName} adminRole={adminRole} />
      </div>

      <div className="flex flex-1 flex-col lg:pl-56">
        {/* Top bar */}
        <header className="admin-topbar sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-white/55 hover:bg-white/5 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">
            {title}
          </h1>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Open · {time}
            </span>
            <NotificationBell apiUrl="/api/admin/notifications" variant="dark" />
            <Link
              href="/admin/profile"
              className="admin-user-chip hidden h-8 items-center gap-1.5 px-2 py-1 transition hover:bg-white/10 sm:flex"
            >
              <div className="avatar !h-6 !w-6 !text-[10px]">
                {adminName.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-white">
                {adminName.split(" ")[0]}
              </span>
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>
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
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <AdminSidebar
              pathname={pathname}
              adminName={adminName}
              adminRole={adminRole}
              onNavigate={closeSidebar}
              className="h-full w-[min(15rem,85vw)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
