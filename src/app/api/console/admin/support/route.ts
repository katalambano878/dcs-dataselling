import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAdminApi } from "@/lib/auth/admin-api";
import {
  fetchAdminConsoleSupportTickets,
  updateAdminConsoleSupportTicket,
} from "@/lib/console/support-admin";
import { hasSupabaseConfig } from "@/lib/supabase/server";

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) return NextResponse.json({ tickets: [] });

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const status = new URL(request.url).searchParams.get("status") ?? "all";
  const tickets = await fetchAdminConsoleSupportTickets(
    status === "open" ||
      status === "in_progress" ||
      status === "resolved" ||
      status === "closed"
      ? status
      : "all",
  );

  return NextResponse.json({ tickets });
}

const patchSchema = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  admin_reply: z.string().max(4000).optional(),
});

export async function PATCH(request: Request) {
  if (!hasSupabaseConfig()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const auth = await assertAdminApi();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const ok = await updateAdminConsoleSupportTicket({
      ticketId: body.ticket_id,
      status: body.status,
      adminReply: body.admin_reply,
    });
    if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
