import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import type { ConsoleTicketPriority, ConsoleTicketStatus } from "@/lib/console/support";

export interface AdminConsoleSupportTicket {
  id: string;
  vendorId: string;
  businessName: string;
  slug: string;
  subject: string;
  message: string;
  priority: ConsoleTicketPriority;
  status: ConsoleTicketStatus;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminConsoleSupportTickets(
  status?: ConsoleTicketStatus | "all",
): Promise<AdminConsoleSupportTicket[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();

  let query = service
    .from("console_support_tickets")
    .select(
      "id, vendor_id, subject, message, priority, status, admin_reply, created_at, updated_at, vendors(business_name, slug)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  const { data } = await query;

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      vendor_id: string;
      subject: string;
      message: string;
      priority: ConsoleTicketPriority;
      status: ConsoleTicketStatus;
      admin_reply: string | null;
      created_at: string;
      updated_at: string;
      vendors: { business_name: string; slug: string } | { business_name: string; slug: string }[] | null;
    };
    const vendor = Array.isArray(r.vendors) ? r.vendors[0] : r.vendors;
    return {
      id: r.id,
      vendorId: r.vendor_id,
      businessName: vendor?.business_name ?? "Unknown",
      slug: vendor?.slug ?? "—",
      subject: r.subject,
      message: r.message,
      priority: r.priority,
      status: r.status,
      adminReply: r.admin_reply,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export async function updateAdminConsoleSupportTicket(params: {
  ticketId: string;
  status?: ConsoleTicketStatus;
  adminReply?: string;
}): Promise<boolean> {
  if (!hasSupabaseConfig()) return false;
  const service = createServiceClient();

  const patch: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };
  if (params.status) patch.status = params.status;
  if (params.adminReply !== undefined) patch.admin_reply = params.adminReply;

  const { error } = await service
    .from("console_support_tickets")
    .update(patch)
    .eq("id", params.ticketId);

  return !error;
}
