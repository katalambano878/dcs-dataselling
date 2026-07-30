"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client.
 * In plain-Postgres mode, point NEXT_PUBLIC_SUPABASE_URL at this app
 * (e.g. https://staging.example.com) so /auth/v1 and /rest/v1 shims are used.
 * Prefer server API routes for password changes and privileged mutations.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error(
      "Browser auth client requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "In plain-Postgres mode, set URL to the app origin and ANON_KEY to any non-empty staging key.",
    );
  }

  return createBrowserClient(url, anon);
}
