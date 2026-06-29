"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Code,
  History,
  LayoutGrid,
  LifeBuoy,
  Menu,
  Monitor,
  Send,
  Shield,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { DcsLogo } from "@/components/brand/dcs-logo";
import { consoleNavHref, consoleStaffNavHref } from "@/lib/platform/console-host";
import { SITE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type NavSegment = "" | "send" | "transactions" | "credits" | "profile" | "support" | "developer";

type NavItem = {
  segment: NavSegment;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Main",
    items: [
      { segment: "", label: "Dashboard", icon: LayoutGrid },
      { segment: "send", label: "Send Bundle", icon: Send },
      { segment: "transactions", label: "Transaction History", icon: History },
    ],
  },
  {
    title: "Transactions",
    items: [
      { segment: "credits", label: "Credit History", icon: Wallet },
      { segment: "profile", label: "User Profile", icon: User },
    ],
  },
  {
    title: "Misc",
    items: [
      { segment: "support", label: "Support", icon: LifeBuoy },
      { segment: "developer", label: "API", icon: Code },
    ],
  },
];

interface ConsoleShellProps {
  businessName: string;
  username: string;
  onConsoleHost?: boolean;
  isStaff?: boolean;
  children: React.ReactNode;
}

function pageTitleFromPath(pathname: string): string {
  const titles: Record<string, string> = {
    "/": "Dashboard",
    "/console": "Dashboard",
    "/send": "Send Bundle",
    "/console/send": "Send Bundle",
    "/transactions": "Transaction History",
    "/console/transactions": "Transaction History",
    "/credits": "Credit History",
    "/console/credits": "Credit History",
    "/profile": "User Profile",
    "/console/profile": "User Profile",
    "/support": "Support",
    "/console/support": "Support",
    "/developer": "API",
    "/console/api": "API",
    "/admin": "Console admin",
    "/console/admin": "Console admin",
    "/admin/support": "Support tickets",
    "/console/admin/support": "Support tickets",
  };
  return titles[pathname] ?? "Data Console";
}

function isNavActive(pathname: string, segment: NavSegment, onConsoleHost: boolean): boolean {
  const href = consoleNavHref(segment, onConsoleHost);
  if (segment === "") {
    return pathname === href || pathname === "/console";
  }
  if (segment === "developer") {
    return pathname === href || pathname === "/console/api";
  }
  return pathname === href || pathname === `/console/${segment}`;
}

function ConsoleSidebarNav({
  pathname,
  businessName,
  username,
  onConsoleHost,
  isStaff,
  onNavigate,
}: {
  pathname: string;
  businessName: string;
  username: string;
  onConsoleHost: boolean;
  isStaff?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="border-b border-white/6 p-3">
        <Link
          href={isStaff ? consoleStaffNavHref("", onConsoleHost) : consoleNavHref("profile", onConsoleHost)}
          onClick={onNavigate}
          className="admin-user-chip block transition hover:bg-white/5"
        >
          <div className="avatar">{businessName.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{businessName}</p>
            <p className="truncate text-[11px] text-white/55">@{username}</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="nav-section-label mb-2 px-3">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavActive(pathname, item.segment, onConsoleHost);
                const href = consoleNavHref(item.segment, onConsoleHost);
                return (
                  <li key={item.segment || "home"}>
                    <Link
                      href={href}
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

        {isStaff && (
          <div>
            <p className="nav-section-label mb-2 px-3">Staff</p>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href={consoleStaffNavHref("", onConsoleHost)}
                  onClick={onNavigate}
                  className={cn(
                    "nav-link",
                    (pathname === "/admin" ||
                      pathname === "/console/admin" ||
                      (pathname.startsWith("/admin") && !pathname.startsWith("/admin/support"))) &&
                      "nav-link-active",
                  )}
                >
                  <Shield className="nav-icon" />
                  <span className="truncate">Console admin</span>
                </Link>
              </li>
              <li>
                <Link
                  href={consoleStaffNavHref("support", onConsoleHost)}
                  onClick={onNavigate}
                  className={cn(
                    "nav-link",
                    (pathname === "/admin/support" || pathname === "/console/admin/support") &&
                      "nav-link-active",
                  )}
                >
                  <LifeBuoy className="nav-icon" />
                  <span className="truncate">Support tickets</span>
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-white/6 p-3">
        <Link
          href={SITE.url}
          className="mb-1 block rounded-lg px-3 py-1.5 text-xs font-medium text-white/55 hover:bg-white/5 hover:text-white"
        >
          Vendor dashboard (GHS wallet)
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

function ConsoleSidebar({
  pathname,
  businessName,
  username,
  onConsoleHost,
  isStaff,
  onNavigate,
  className,
}: {
  pathname: string;
  businessName: string;
  username: string;
  onConsoleHost: boolean;
  isStaff?: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <aside className={cn("admin-sidebar flex h-full w-56 flex-col border-r", className)}>
      <Link
        href={consoleNavHref("", onConsoleHost)}
        onClick={onNavigate}
        className="flex h-14 shrink-0 items-center gap-2 border-b border-white/6 px-3.5"
      >
        <DcsLogo size={24} className="max-w-full" />
        <div className="min-w-0">
          <span className="block text-xs font-extrabold tracking-tight text-white">DCS Elite</span>
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide text-sky-300/90">
            Data Console
          </span>
        </div>
      </Link>
      <ConsoleSidebarNav
        pathname={pathname}
        businessName={businessName}
        username={username}
        onConsoleHost={onConsoleHost}
        isStaff={isStaff}
        onNavigate={onNavigate}
      />
    </aside>
  );
}

export function ConsoleShell({
  businessName,
  username,
  onConsoleHost = false,
  isStaff = false,
  children,
}: ConsoleShellProps) {
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
      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
        <ConsoleSidebar
          pathname={pathname}
          businessName={businessName}
          username={username}
          onConsoleHost={onConsoleHost}
          isStaff={isStaff}
        />
      </div>

      <div className="flex flex-1 flex-col lg:pl-56">
        <header className="admin-topbar sticky top-0 z-30 flex h-14 items-center gap-2.5 border-b px-3 sm:px-5 lg:px-6">
          <button
            type="button"
            className="rounded-lg p-2 text-white/55 hover:bg-white/5 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Monitor className="hidden h-4 w-4 text-sky-300 sm:block" aria-hidden />
          <h1 className="truncate text-sm font-bold tracking-tight text-white sm:text-base">{title}</h1>

          <div className="ml-auto flex items-center gap-1.5">
            <span className="hidden items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Open · {time}
            </span>
            <Link
              href={isStaff ? consoleStaffNavHref("", onConsoleHost) : consoleNavHref("profile", onConsoleHost)}
              className="admin-user-chip hidden h-8 items-center gap-1.5 px-2 py-1 transition hover:bg-white/10 sm:flex"
            >
              <div className="avatar !h-6 !w-6 !text-[10px]">
                {businessName.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-white">{businessName.split(" ")[0]}</span>
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={closeSidebar}
          />
          <div className="absolute left-0 top-0 h-full shadow-2xl">
            <ConsoleSidebar
              pathname={pathname}
              businessName={businessName}
              username={username}
              onConsoleHost={onConsoleHost}
              isStaff={isStaff}
              onNavigate={closeSidebar}
              className="h-full w-[min(15rem,85vw)]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
