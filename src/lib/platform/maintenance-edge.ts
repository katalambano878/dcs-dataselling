/** Edge-safe maintenance flag lookup (middleware). Uses Supabase REST directly. */

export interface MaintenanceState {
  enabled: boolean;
  message: string;
}

const DEFAULT: MaintenanceState = { enabled: false, message: "" };

export async function fetchMaintenanceState(): Promise<MaintenanceState> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !serviceKey) return DEFAULT;

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/platform_settings?key=eq.platform_config&select=value`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: "no-store",
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
    pathname.startsWith("/_next")
  );
}
