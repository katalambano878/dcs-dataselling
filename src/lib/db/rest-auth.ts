import type { NextRequest } from "next/server";

/**
 * Protect PostgREST/GoTrue-compat shims. In plain-PG mode these talk to Postgres
 * with no RLS — require a shared secret (service role or dedicated REST key).
 */
export function authorizeRestShim(req: NextRequest): boolean {
  const expected =
    process.env.REST_V1_API_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!expected) return false;

  const apiKey = req.headers.get("apikey") || "";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.replace(/^Bearer\s+/i, "").trim();

  return apiKey === expected || bearer === expected;
}
