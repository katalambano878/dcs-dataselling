import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  fetchMaintenanceState,
  isMaintenanceBypassPath,
} from "@/lib/platform/maintenance-edge";
import {
  CONSOLE_PATH_PREFIX,
  consoleInternalToPublicPath,
  consolePublicToInternalPath,
  getConsolePublicUrl,
  isConsoleHost,
  isLegacyConsolePrefixedPath,
} from "@/lib/platform/console-host";

const PROTECTED_PREFIXES = ["/admin", "/vendor/dashboard", "/account", "/checkout", CONSOLE_PATH_PREFIX];
const MAIN_SITE_PREFIXES = ["/admin", "/vendor", "/account", "/orders", "/create-store", "/checkout"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const onConsoleHost = isConsoleHost(host);

  if (onConsoleHost) {
    const mainSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dcselite.com";

    // Staff admin panel lives on the console subdomain at /admin
    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const suffix = pathname.slice("/admin".length);
      const url = request.nextUrl.clone();
      url.pathname = `${CONSOLE_PATH_PREFIX}/admin${suffix}`;
      return NextResponse.rewrite(url);
    }

    const mainSitePrefixes = MAIN_SITE_PREFIXES.filter((p) => p !== "/admin");
    if (mainSitePrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, mainSite));
    }

    // Legacy /console/* or bad /console/vendor/* → clean console URLs.
    if (isLegacyConsolePrefixedPath(pathname)) {
      const suffix = pathname.slice(CONSOLE_PATH_PREFIX.length);
      if (suffix.startsWith("/vendor")) {
        return NextResponse.redirect(new URL(`/${request.nextUrl.search}`, request.url));
      }
      if (suffix.startsWith("/admin")) {
        const publicAdmin = `/admin${suffix.slice("/admin".length)}`;
        return NextResponse.redirect(new URL(`${publicAdmin}${request.nextUrl.search}`, request.url));
      }
      const publicPath = consoleInternalToPublicPath(pathname);
      if (publicPath) {
        return NextResponse.redirect(new URL(`${publicPath}${request.nextUrl.search}`, request.url));
      }
      return NextResponse.redirect(new URL(`/${request.nextUrl.search}`, request.url));
    }

    // BestPay-style clean paths: console.dcselite.com/send → internal /console/send
    const internal = consolePublicToInternalPath(pathname);
    if (internal) {
      const url = request.nextUrl.clone();
      url.pathname = internal;
      return NextResponse.rewrite(url);
    }
  } else if (pathname.startsWith(CONSOLE_PATH_PREFIX)) {
    const subPath = pathname.slice(CONSOLE_PATH_PREFIX.length) || "";
    const target = `${getConsolePublicUrl()}${subPath || "/"}${request.nextUrl.search}`;
    return NextResponse.redirect(target);
  }

  let response: NextResponse;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    response = await updateSession(request);
    if (PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
      // Auth enforcement hooks in when Supabase is configured
    }
  } else {
    response = NextResponse.next();
  }

  if (!isMaintenanceBypassPath(pathname)) {
    const maintenance = await fetchMaintenanceState();
    if (maintenance.enabled) {
      const url = request.nextUrl.clone();
      url.pathname = "/maintenance";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
