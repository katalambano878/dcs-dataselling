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

/** Path prefix for console UI routes in the main app router. */
export const CONSOLE_PATH_PREFIX = "/console";

export function consolePath(path = ""): string {
  const p = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${CONSOLE_PATH_PREFIX}${p}`;
}
