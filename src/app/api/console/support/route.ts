import { NextResponse } from "next/server";
import { z } from "zod";
import { getConsoleApiContext, isConsoleApiError } from "@/lib/auth/console-api";
import {
  createConsoleSupportTicket,
  fetchConsoleSupportTickets,
} from "@/lib/console/support";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET() {
  if (!hasSupabaseConfig()) return NextResponse.json({ tickets: [] });

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  const tickets = await fetchConsoleSupportTickets(ctx.vendorId);
  return NextResponse.json({ tickets });
}

const createSchema = z.object({
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(4000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
});

export async function POST(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const ctx = await getConsoleApiContext();
  if (isConsoleApiError(ctx)) return ctx;

  try {
    const body = createSchema.parse(await request.json());
    const ticket = await createConsoleSupportTicket({
      vendorId: ctx.vendorId,
      subject: body.subject,
      message: body.message,
      priority: body.priority,
    });
    return NextResponse.json({ ok: true, ticket });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create ticket" },
      { status: 400 },
    );
  }
}
