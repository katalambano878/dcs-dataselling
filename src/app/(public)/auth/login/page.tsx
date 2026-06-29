import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, Package, ShieldCheck, Store, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DcsLogo } from "@/components/brand/dcs-logo";
import { LoginForm } from "@/components/auth/login-form";
import { isConsoleHost, getConsoleHomePath } from "@/lib/platform/console-host";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description:
    "Sign in to your DCS ELITE account to manage your data store, track orders, top up your wallet, and view receipts.",
  alternates: { canonical: "/auth/login" },
  robots: { index: false, follow: true },
};

const PERKS = [
  { icon: Package, text: "Track orders and receipts" },
  { icon: Zap, text: "Buy data in seconds with MoMo" },
  { icon: ShieldCheck, text: "Secure, BoG-licensed payments" },
] as const;

const CONSOLE_PERKS = [
  { icon: Zap, text: "Send bundles from your GB / MB balance" },
  { icon: Package, text: "Separate from the main-site GHS wallet" },
  { icon: ShieldCheck, text: "Dedicated agent data console" },
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const host = (await headers()).get("host");
  const onConsole = isConsoleHost(host);
  const redirectTo =
    next?.startsWith("/") && !next.startsWith("//") ? next : onConsole ? getConsoleHomePath() : undefined;
  const perks = onConsole ? CONSOLE_PERKS : PERKS;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-100 lg:grid lg:min-h-screen lg:grid-cols-2">
      {/* Brand panel — full-bleed photo */}
      <div className="relative hidden min-h-[280px] overflow-hidden lg:flex lg:min-h-full lg:flex-col lg:justify-between">
        <div className="absolute inset-0">
          <Image
            src="/hero-auth.png"
            alt="Customer managing mobile data orders on DCS"
            fill
            sizes="(max-width: 1024px) 0vw, 50vw"
            className="object-cover"
            style={{ objectPosition: "50% 30%" }}
            priority
          />
        </div>

        {/* 20% overlay */}
        <div aria-hidden className="absolute inset-0 bg-black/20" />

        {/* Readability gradients */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background: `
              linear-gradient(180deg, rgba(6, 9, 20, 0.82) 0%, rgba(6, 9, 20, 0.25) 38%, rgba(6, 9, 20, 0.35) 62%, rgba(6, 9, 20, 0.88) 100%),
              radial-gradient(ellipse 50% 40% at 15% 10%, rgba(34, 211, 238, 0.12), transparent 55%)
            `,
          }}
        />

        <div className="relative z-10 px-8 pb-4 pt-10 lg:pt-12">
          <h1 className="max-w-sm text-3xl font-extrabold tracking-tight text-white">
            {onConsole ? (
              <>
                DCS <span className="text-blue-300">Data Console</span>
              </>
            ) : (
              <>
                Welcome back to{" "}
                <span className="text-aurora">Ghana&apos;s elite data platform.</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-300">
            {onConsole
              ? "Sign in to send bundles from your allocated gigabyte balance — not your GHS wallet."
              : "Sign in to view orders, manage your account, or access your vendor dashboard."}
          </p>
        </div>

        <ul className="relative z-10 space-y-3 px-8 pb-10 lg:pb-12">
          {perks.map((item) => (
            <li
              key={item.text}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
                <item.icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-sm font-medium text-slate-100">{item.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Form panel */}
      <div className="flex flex-col px-4 py-8 sm:px-6 sm:py-12 lg:items-center lg:justify-center lg:px-12">
        {/* Mobile brand strip */}
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <Link href="/" className="inline-flex">
            <DcsLogo size={36} />
          </Link>
          <Link
            href="/support"
            className="text-xs font-semibold text-cyan-700 hover:text-cyan-600"
          >
            Support →
          </Link>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_20px_60px_rgba(6,9,20,0.08)]">
            <div className={`h-1 bg-gradient-to-r ${onConsole ? "from-blue-600 via-blue-500 to-indigo-500" : "from-cyan-500 via-teal-500 to-cyan-400"}`} />

            <div className="p-6 sm:p-8">
              <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${onConsole ? "text-blue-600" : "text-cyan-600"}`}>
                {onConsole ? "Data Console" : "Account"}
              </span>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">
                Sign in
              </h2>
              <p className="mt-1 text-sm text-muted">
                {onConsole
                  ? "Access your GB balance and send bundles to customers."
                  : "Access your orders, wallet, and vendor tools."}
              </p>

              <LoginForm redirectTo={redirectTo} />

              {!onConsole ? (
                <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    or
                  </span>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" size="sm" className="w-full" asChild>
                  <Link href="/support">Get support</Link>
                </Button>
                <Button variant="secondary" size="sm" className="w-full" asChild>
                  <Link href="/create-store">
                    <Store className="h-3.5 w-3.5" />
                    Sell on DCS
                  </Link>
                </Button>
              </div>
                </>
              ) : null}
            </div>

            {!onConsole ? (
            <div className="border-t border-border bg-slate-50/80 px-6 py-4 text-center sm:px-8">
              <p className="text-sm text-muted">
                New vendor?{" "}
                <Link
                  href="/create-store"
                  className="font-semibold text-cyan-700 hover:text-cyan-600"
                >
                  Create your store
                </Link>
                {" · "}
                <Link
                  href="/vendor/dashboard"
                  className="font-semibold text-cyan-700 hover:text-cyan-600"
                >
                  Dashboard
                </Link>
              </p>
            </div>
            ) : null}
          </div>

          <p className="mt-4 text-center text-xs text-muted">
            <Link href={onConsole ? "/" : "/"} className="font-semibold text-foreground hover:text-cyan-700">
              ← {onConsole ? "Back to console home" : "Back to home"}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
