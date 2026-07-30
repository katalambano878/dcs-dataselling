import { type NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
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
/** Edge-safe: avoid importing the DB package graph into middleware. */
function isPlainPostgres(): boolean {
  return !!(process.env.DATABASE_URL || process.env.POSTGRES_URL);
}

const PROTECTED_PREFIXES = [
  "/admin",
  "/vendor/dashboard",
  "/account",
  CONSOLE_PATH_PREFIX,
];
const MAIN_SITE_PREFIXES = [
  "/admin",
  "/vendor",
  "/account",
  "/orders",
  "/create-store",
  "/checkout",
];

const LOGIN_PATH = "/auth/login";

function applySecurityHeaders(response: NextResponse, pathname: string) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  if (pathname.startsWith("/admin")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  }

  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/rest/") ||
    pathname.startsWith("/auth/v1") ||
    pathname.startsWith("/storage/")
  ) {
    response.headers.set("Cache-Control", "no-store");
  }
}

function extractAccessToken(request: NextRequest): string | undefined {
  let token = request.cookies.get("sb-access-token")?.value;
  if (token) return token;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = supabaseUrl?.split("//")[1]?.split(".")[0];
  if (projectRef) {
    token = request.cookies.get(`sb-${projectRef}-auth-token`)?.value;
    if (token) {
      try {
        const parsed = JSON.parse(token);
        if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);
        if (typeof parsed === "object" && parsed && "access_token" in parsed) {
          return String((parsed as { access_token: string }).access_token);
        }
      } catch {
        return token;
      }
    }
  }

  for (const [name, cookie] of request.cookies) {
    if (name.startsWith("sb-") && (name.endsWith("-auth-token") || name.includes("auth"))) {
      try {
        const parsed = JSON.parse(cookie.value);
        if (Array.isArray(parsed) && parsed[0]) return String(parsed[0]);
        if (typeof parsed === "object" && parsed && "access_token" in parsed) {
          return String((parsed as { access_token: string }).access_token);
        }
        if (typeof parsed === "string") return parsed;
      } catch {
        return cookie.value;
      }
    }
  }

  return undefined;
}

async function verifyPlainPgToken(
  token: string,
): Promise<{ ok: boolean; userId?: string; role?: string }> {
  const secret =
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET;
  if (!secret) return { ok: false };

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.typ === "refresh") return { ok: false };
    const userId = typeof payload.sub === "string" ? payload.sub : undefined;
    if (!userId) return { ok: false };
    const appMeta = (payload.app_metadata || {}) as { role?: string };
    return { ok: true, userId, role: appMeta.role };
  } catch {
    return { ok: false };
  }
}

function redirectToLogin(request: NextRequest, error?: string) {
  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  if (error) loginUrl.searchParams.set("error", error);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");
  const onConsoleHost = isConsoleHost(host);

  // Soft auth gate for protected UI (layouts still enforce roles).
  const needsAuth =
    PROTECTED_PREFIXES.some((p) => pathname.startsWith(p)) ||
    (onConsoleHost && (pathname === "/admin" || pathname.startsWith("/admin/")));

  if (needsAuth && isPlainPostgres()) {
    const token = extractAccessToken(request);
    if (!token) {
      return redirectToLogin(request);
    }
    const verified = await verifyPlainPgToken(token);
    if (!verified.ok) {
      return redirectToLogin(request, "session_expired");
    }
  }

  if (onConsoleHost) {
    const mainSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dcselite.com";

    if (pathname === "/admin" || pathname.startsWith("/admin/")) {
      const suffix = pathname.slice("/admin".length);
      const url = request.nextUrl.clone();
      url.pathname = `${CONSOLE_PATH_PREFIX}/admin${suffix}`;
      const rewritten = NextResponse.rewrite(url);
      applySecurityHeaders(rewritten, pathname);
      return rewritten;
    }

    const mainSitePrefixes = MAIN_SITE_PREFIXES.filter((p) => p !== "/admin");
    if (mainSitePrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL(`${pathname}${request.nextUrl.search}`, mainSite));
    }

    if (isLegacyConsolePrefixedPath(pathname)) {
      const suffix = pathname.slice(CONSOLE_PATH_PREFIX.length);
      if (suffix.startsWith("/vendor")) {
        return NextResponse.redirect(new URL(`/${request.nextUrl.search}`, request.url));
      }
      if (suffix.startsWith("/admin")) {
        const publicAdmin = `/admin${suffix.slice("/admin".length)}`;
        return NextResponse.redirect(
          new URL(`${publicAdmin}${request.nextUrl.search}`, request.url),
        );
      }
      const publicPath = consoleInternalToPublicPath(pathname);
      if (publicPath) {
        return NextResponse.redirect(
          new URL(`${publicPath}${request.nextUrl.search}`, request.url),
        );
      }
      return NextResponse.redirect(new URL(`/${request.nextUrl.search}`, request.url));
    }

    const internal = consolePublicToInternalPath(pathname);
    if (internal) {
      const url = request.nextUrl.clone();
      url.pathname = internal;
      const rewritten = NextResponse.rewrite(url);
      applySecurityHeaders(rewritten, pathname);
      return rewritten;
    }
  } else if (pathname.startsWith(CONSOLE_PATH_PREFIX)) {
    const subPath = pathname.slice(CONSOLE_PATH_PREFIX.length) || "";
    const target = `${getConsolePublicUrl()}${subPath || "/"}${request.nextUrl.search}`;
    return NextResponse.redirect(target);
  }

  let response: NextResponse;

  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    !isPlainPostgres()
  ) {
    response = await updateSession(request);
  } else {
    response = NextResponse.next();
  }

  if (needsAuth && isPlainPostgres()) {
    const token = extractAccessToken(request);
    if (token) {
      const verified = await verifyPlainPgToken(token);
      if (verified.ok && verified.userId) {
        response.headers.set("x-user-id", verified.userId);
        if (verified.role) response.headers.set("x-user-role", verified.role);
      }
    }
  }

  applySecurityHeaders(response, pathname);

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
