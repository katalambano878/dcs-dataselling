import { SITE } from "@/lib/constants";

/** Public console subdomain URL (no trailing slash). */
export function getConsolePublicUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_CONSOLE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return `https://console.${SITE.domain}`;
}

export function stripPort(host: string): string {
  return host.split(":")[0]?.toLowerCase() ?? "";
}

/** True when the request host is the data console subdomain. */
export function isConsoleHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = stripPort(host);
  const configured = process.env.NEXT_PUBLIC_CONSOLE_HOST?.trim().toLowerCase();
  if (configured && h === configured) return true;
  if (h === `console.${SITE.domain}`) return true;
  if (h === "console.localhost") return true;
  return false;
}

/** Internal Next.js route prefix for console UI pages. */
export const CONSOLE_PATH_PREFIX = "/console";

/** Clean public paths on console.dcselite.com (no /console prefix). */
export const CONSOLE_PUBLIC_SEGMENTS = [
  "",
  "send",
  "transactions",
  "credits",
  "profile",
  "support",
  "developer",
] as const;

const PUBLIC_TO_INTERNAL: Record<string, string> = {
  "/": CONSOLE_PATH_PREFIX,
  "/send": `${CONSOLE_PATH_PREFIX}/send`,
  "/transactions": `${CONSOLE_PATH_PREFIX}/transactions`,
  "/credits": `${CONSOLE_PATH_PREFIX}/credits`,
  "/profile": `${CONSOLE_PATH_PREFIX}/profile`,
  "/support": `${CONSOLE_PATH_PREFIX}/support`,
  "/developer": `${CONSOLE_PATH_PREFIX}/api`,
  "/admin": `${CONSOLE_PATH_PREFIX}/admin`,
  "/admin/support": `${CONSOLE_PATH_PREFIX}/admin/support`,
};

const INTERNAL_TO_PUBLIC: Record<string, string> = {
  [CONSOLE_PATH_PREFIX]: "/",
  [`${CONSOLE_PATH_PREFIX}/send`]: "/send",
  [`${CONSOLE_PATH_PREFIX}/transactions`]: "/transactions",
  [`${CONSOLE_PATH_PREFIX}/credits`]: "/credits",
  [`${CONSOLE_PATH_PREFIX}/profile`]: "/profile",
  [`${CONSOLE_PATH_PREFIX}/support`]: "/support",
  [`${CONSOLE_PATH_PREFIX}/api`]: "/developer",
  [`${CONSOLE_PATH_PREFIX}/admin`]: "/admin",
  [`${CONSOLE_PATH_PREFIX}/admin/support`]: "/admin/support",
};

/** Staff-only console admin paths (console.dcselite.com/admin). */
export function consoleStaffNavHref(segment: "" | "support", onConsoleHost: boolean): string {
  const path = segment ? `/admin/${segment}` : "/admin";
  if (onConsoleHost) return path;
  return `${CONSOLE_PATH_PREFIX}/admin${segment ? `/${segment}` : ""}`;
}

/** Home path after sign-in on the console subdomain. */
export function getConsoleHomePath(): string {
  return "/";
}

/** Internal app route for console UI (always under /console/*). */
export function consoleInternalPath(path = ""): string {
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${CONSOLE_PATH_PREFIX}${p}`;
}

/** Link href for console nav — clean paths on subdomain, /console/* on main site. */
export function consoleNavHref(segment: (typeof CONSOLE_PUBLIC_SEGMENTS)[number], onConsoleHost: boolean): string {
  if (onConsoleHost) {
    return segment ? `/${segment}` : "/";
  }
  if (segment === "developer") return `${CONSOLE_PATH_PREFIX}/api`;
  return segment ? `${CONSOLE_PATH_PREFIX}/${segment}` : CONSOLE_PATH_PREFIX;
}

/** Map console.dcselite.com public URL to internal /console route for rewrites. */
export function consolePublicToInternalPath(pathname: string): string | null {
  const path = pathname.replace(/\/$/, "") || "/";
  return PUBLIC_TO_INTERNAL[path] ?? null;
}

/** Map internal /console route to clean public URL on the console subdomain. */
export function consoleInternalToPublicPath(pathname: string): string | null {
  return INTERNAL_TO_PUBLIC[pathname] ?? null;
}

export function isConsolePublicUiPath(pathname: string): boolean {
  return consolePublicToInternalPath(pathname) !== null;
}

export function isLegacyConsolePrefixedPath(pathname: string): boolean {
  return pathname === CONSOLE_PATH_PREFIX || pathname.startsWith(`${CONSOLE_PATH_PREFIX}/`);
}

/** Legacy path for main-site redirects (dcselite.com/console → subdomain). */
export function consolePath(path = ""): string {
  return consoleInternalPath(path);
}
