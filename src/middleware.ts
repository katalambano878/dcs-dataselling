import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import {
  fetchMaintenanceState,
  isMaintenanceBypassPath,
} from "@/lib/platform/maintenance-edge";
import { CONSOLE_PATH_PREFIX, getConsolePublicUrl, isConsoleHost } from "@/lib/platform/console-host";

const PROTECTED_PREFIXES = ["/admin", "/vendor/dashboard", "/account", "/checkout", CONSOLE_PATH_PREFIX];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const onConsoleHost = isConsoleHost(host);

  if (onConsoleHost) {
    const mainSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dcselite.com";
    const mainSitePrefixes = ["/admin", "/vendor", "/account", "/orders", "/create-store", "/checkout"];
    if (mainSitePrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, mainSite));
    }

    if (
      !pathname.startsWith(CONSOLE_PATH_PREFIX) &&
      !pathname.startsWith("/auth") &&
      !pathname.startsWith("/api") &&
      !pathname.startsWith("/maintenance") &&
      !pathname.startsWith("/_next") &&
      pathname !== "/favicon.ico"
    ) {
      if (pathname === "/") {
        return NextResponse.redirect(new URL(CONSOLE_PATH_PREFIX, request.url));
      }
      return NextResponse.redirect(new URL(`${CONSOLE_PATH_PREFIX}${pathname}`, request.url));
    }
  } else if (pathname.startsWith(CONSOLE_PATH_PREFIX)) {
    const subPath = pathname.slice(CONSOLE_PATH_PREFIX.length) || "";
    const target = `${getConsolePublicUrl()}${CONSOLE_PATH_PREFIX}${subPath}${request.nextUrl.search}`;
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
