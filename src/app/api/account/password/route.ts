import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/server";

const schema = z.object({
  password: z.string().min(8).max(128),
});

/** Authenticated password change for vendor/admin profiles (plain-PG + Supabase). */
export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password: body.password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
