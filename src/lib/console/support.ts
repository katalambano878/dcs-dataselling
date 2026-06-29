import "server-only";

import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";

export type ConsoleTicketPriority = "low" | "medium" | "high" | "urgent";
export type ConsoleTicketStatus = "open" | "in_progress" | "resolved" | "closed";

export interface ConsoleSupportTicket {
  id: string;
  subject: string;
  message: string;
  priority: ConsoleTicketPriority;
  status: ConsoleTicketStatus;
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsoleFaqItem {
  id: string;
  question: string;
  answer: string;
}

export async function fetchConsoleSupportTickets(vendorId: string): Promise<ConsoleSupportTicket[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("console_support_tickets")
    .select("id, subject, message, priority, status, admin_reply, created_at, updated_at")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (data ?? []).map((row) => {
    const r = row as {
      id: string;
      subject: string;
      message: string;
      priority: ConsoleTicketPriority;
      status: ConsoleTicketStatus;
      admin_reply: string | null;
      created_at: string;
      updated_at: string;
    };
    return {
      id: r.id,
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

export async function createConsoleSupportTicket(params: {
  vendorId: string;
  subject: string;
  message: string;
  priority?: ConsoleTicketPriority;
}): Promise<ConsoleSupportTicket> {
  if (!hasSupabaseConfig()) throw new Error("Not configured");
  const subject = params.subject.trim();
  const message = params.message.trim();
  if (subject.length < 3) throw new Error("Subject is too short");
  if (message.length < 10) throw new Error("Please describe the issue in more detail");

  const service = createServiceClient();
  const { data, error } = await service
    .from("console_support_tickets")
    .insert({
      vendor_id: params.vendorId,
      subject,
      message,
      priority: params.priority ?? "medium",
      status: "open",
    })
    .select("id, subject, message, priority, status, admin_reply, created_at, updated_at")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Could not create ticket");

  const r = data as {
    id: string;
    subject: string;
    message: string;
    priority: ConsoleTicketPriority;
    status: ConsoleTicketStatus;
    admin_reply: string | null;
    created_at: string;
    updated_at: string;
  };

  return {
    id: r.id,
    subject: r.subject,
    message: r.message,
    priority: r.priority,
    status: r.status,
    adminReply: r.admin_reply,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function fetchConsoleFaq(): Promise<ConsoleFaqItem[]> {
  if (!hasSupabaseConfig()) return [];
  const service = createServiceClient();
  const { data } = await service
    .from("console_faq")
    .select("id, question, answer")
    .eq("active", true)
    .order("sort_order", { ascending: true });

  return (data ?? []).map((row) => {
    const r = row as { id: string; question: string; answer: string };
    return { id: r.id, question: r.question, answer: r.answer };
  });
}
