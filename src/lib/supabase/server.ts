import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isPlainPostgres } from "@/lib/db/mode";
import { readAccessTokenFromCookies } from "@/lib/db/session-cookies";
import { createClient as createPgClient } from "@/lib/db/supabase-compat";

export async function createClient() {
  if (isPlainPostgres()) {
    return createPgClient({
      getAccessToken: () => readAccessTokenFromCookies(),
    });
  }

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component — safe to ignore
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  if (isPlainPostgres()) {
    // Service client has no user session — admin/background work only.
    return createPgClient();
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

/**
 * True when the app can reach a database — either hosted Supabase
 * or plain Postgres via DATABASE_URL / POSTGRES_URL.
 */
export function hasSupabaseConfig() {
  if (isPlainPostgres()) return true;
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
