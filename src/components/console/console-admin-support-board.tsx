"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { LifeBuoy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminDataTable,
  AdminEmptyState,
  AdminSection,
  AdminTableBody,
  AdminTableHead,
  AdminTd,
  AdminTh,
  AdminTr,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminConsoleSupportTicket } from "@/lib/console/support-admin";
import type { ConsoleTicketStatus } from "@/lib/console/support";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  open: "warning",
  in_progress: "neutral",
  resolved: "success",
  closed: "neutral",
};

interface Props {
  initialTickets: AdminConsoleSupportTicket[];
}

export function ConsoleAdminSupportBoard({ initialTickets }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [pending, setPending] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<ConsoleTicketStatus>("in_progress");

  const active = tickets.find((t) => t.id === activeId);

  async function save(ticketId: string) {
    setPending(ticketId);
    try {
      const res = await fetch("/api/console/admin/support", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_id: ticketId,
          status,
          admin_reply: reply.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Ticket updated");
      setActiveId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(null);
    }
  }

  function openTicket(ticket: AdminConsoleSupportTicket) {
    setActiveId(ticket.id);
    setReply(ticket.adminReply ?? "");
    setStatus(ticket.status === "open" ? "in_progress" : ticket.status);
  }

  return (
    <AdminSection title="Support tickets" icon={LifeBuoy}>
      {active && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-semibold text-white">{active.subject}</p>
          <p className="mt-1 text-xs text-white/55">
            {active.businessName} · @{active.slug} ·{" "}
            {format(new Date(active.createdAt), "yyyy-MM-dd HH:mm")}
          </p>
          <p className="mt-3 text-sm text-white/75">{active.message}</p>
          <label className="mt-4 block text-sm font-medium text-slate-200">
            Admin reply
            <textarea
              className="mt-1 min-h-[100px] w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-slate-200">
            Status
            <select
              className="mt-1 flex h-10 w-full max-w-xs rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              value={status}
              onChange={(e) => setStatus(e.target.value as ConsoleTicketStatus)}
            >
              <option value="open" className="text-slate-900">Open</option>
              <option value="in_progress" className="text-slate-900">In progress</option>
              <option value="resolved" className="text-slate-900">Resolved</option>
              <option value="closed" className="text-slate-900">Closed</option>
            </select>
          </label>
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={pending != null} onClick={() => void save(active.id)}>
              {pending === active.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setActiveId(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {tickets.length === 0 ? (
        <AdminEmptyState icon={LifeBuoy} title="No tickets" description="No support tickets yet." />
      ) : (
        <AdminDataTable minWidth="720px">
          <AdminTableHead>
            <AdminTh>Agent</AdminTh>
            <AdminTh>Subject</AdminTh>
            <AdminTh>Status</AdminTh>
            <AdminTh>Date</AdminTh>
            <AdminTh />
          </AdminTableHead>
          <AdminTableBody>
            {tickets.map((t) => (
              <AdminTr key={t.id}>
                <AdminTd>
                  <p className="font-medium">{t.businessName}</p>
                  <p className="text-xs text-white/50">@{t.slug}</p>
                </AdminTd>
                <AdminTd>
                  <p>{t.subject}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/50">{t.message}</p>
                </AdminTd>
                <AdminTd>
                  <Badge variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status}</Badge>
                </AdminTd>
                <AdminTd className="whitespace-nowrap text-white/55">
                  {format(new Date(t.createdAt), "yyyy-MM-dd HH:mm")}
                </AdminTd>
                <AdminTd>
                  <Button size="sm" variant="secondary" onClick={() => openTicket(t)}>
                    Reply
                  </Button>
                </AdminTd>
              </AdminTr>
            ))}
          </AdminTableBody>
        </AdminDataTable>
      )}
    </AdminSection>
  );
}
