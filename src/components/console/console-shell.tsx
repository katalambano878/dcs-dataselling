"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Code,
  History,
  LayoutGrid,
  LogOut,
  Send,
  User,
  Wallet,
} from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { DcsLogo } from "@/components/brand/dcs-logo";
import { consoleNavHref } from "@/lib/platform/console-host";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/constants";

const NAV: Array<{
  segment: "" | "send" | "transactions" | "credits" | "profile" | "developer";
  label: string;
  icon: typeof LayoutGrid;
  exact?: boolean;
}> = [
  { segment: "", label: "Dashboard", icon: LayoutGrid, exact: true },
  { segment: "send", label: "Send Bundle", icon: Send },
  { segment: "transactions", label: "Transaction History", icon: History },
  { segment: "credits", label: "Credit History", icon: Wallet },
  { segment: "profile", label: "User Profile", icon: User },
  { segment: "developer", label: "API", icon: Code },
] as const;

interface Props {
  businessName: string;
  username: string;
  onConsoleHost?: boolean;
  children: React.ReactNode;
}

function isNavActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ConsoleShell({ businessName, username, onConsoleHost = false, children }: Props) {
  const pathname = usePathname();

  const hrefFor = (segment: (typeof NAV)[number]["segment"]) =>
    consoleNavHref(segment, onConsoleHost);

  return (
    <div className="console-shell flex min-h-screen bg-slate-100">
      <aside className="console-sidebar hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="border-b border-slate-200 px-5 py-4">
          <DcsLogo className="h-8" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            Data Console
          </p>
          <p className="text-[11px] text-muted-foreground">GB / MB balance · send bundles</p>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Main
          </p>
          {NAV.slice(0, 3).map(({ segment, label, icon: Icon, exact }) => {
            const href = hrefFor(segment);
            const active = isNavActive(pathname, href, exact);
            return (
              <Link
                key={segment || "home"}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Transactions
          </p>
          {NAV.slice(3, 5).map(({ segment, label, icon: Icon }) => {
            const href = hrefFor(segment);
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={segment}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
          <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Misc
          </p>
          {NAV.slice(5).map(({ segment, label, icon: Icon }) => {
            const href = hrefFor(segment);
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={segment}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <a
            href={SITE.url}
            className="mb-2 block px-3 text-xs text-blue-600 hover:underline"
          >
            Open {SITE.shortName} marketplace (GHS wallet)
          </a>
          <form action={signOut}>
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-gradient-to-r from-blue-950 via-blue-900 to-slate-900 px-4 py-5 text-white sm:px-6">
          <p className="text-lg font-semibold sm:text-xl">{businessName}</p>
          <p className="text-sm text-white/70">@{username}</p>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
        <footer className="border-t border-slate-200 px-4 py-3 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {SITE.name} · Data Console
        </footer>
      </div>
    </div>
  );
}
