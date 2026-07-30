import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupabaseCompatClient } from "@/lib/db/supabase-compat";

/** Database client used in both Supabase and plain-Postgres staging modes. */
export type DbClient = SupabaseClient | SupabaseCompatClient;
