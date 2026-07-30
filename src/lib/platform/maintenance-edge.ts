/** Edge-safe maintenance flag lookup (middleware). */

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

const DEFAULT: MaintenanceState = { enabled: false, message: "" };

export async function fetchMaintenanceState(): Promise<MaintenanceState> {
  if (process.env.MAINTENANCE_MODE === "true" || process.env.MAINTENANCE_MODE === "1") {
    return {
      enabled: true,
      message: (process.env.MAINTENANCE_MESSAGE || "").trim(),
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Hosted Supabase REST, or local PostgREST shim at SITE_URL in plain-PG mode.
  const base = (supabaseUrl || siteUrl || "").replace(/\/$/, "");
  if (!base) return DEFAULT;

  try {
    const headers: Record<string, string> = {};
    if (serviceKey) {
      headers.apikey = serviceKey;
      headers.Authorization = `Bearer ${serviceKey}`;
    }

    const res = await fetch(
      `${base}/rest/v1/platform_settings?key=eq.platform_config&select=value`,
      {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(2500),
      },
    );

    if (!res.ok) return DEFAULT;

    const rows = (await res.json()) as { value?: Record<string, unknown> }[];
    const value = rows[0]?.value;
    if (!value || typeof value !== "object") return DEFAULT;

    return {
      enabled: value.maintenanceMode === true,
      message:
        typeof value.maintenanceMessage === "string" ? value.maintenanceMessage.trim() : "",
    };
  } catch {
    return DEFAULT;
  }
}

/** Paths that stay reachable while maintenance mode is on. */
export function isMaintenanceBypassPath(pathname: string): boolean {
  return (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/console") ||
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/rest/") ||
    pathname.startsWith("/storage/") ||
    pathname.startsWith("/_next")
  );
}
