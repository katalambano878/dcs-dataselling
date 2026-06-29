"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { LifeBuoy, Loader2, MessageSquarePlus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import type { ConsoleFaqItem, ConsoleSupportTicket } from "@/lib/console/support";

const STATUS_VARIANT: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  open: "warning",
  in_progress: "neutral",
  resolved: "success",
  closed: "neutral",
};

interface Props {
  initialTickets: ConsoleSupportTicket[];
  faq: ConsoleFaqItem[];
}

export function ConsoleSupportBoard({ initialTickets, faq }: Props) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [pending, setPending] = useState(false);
  const [openFaq, setOpenFaq] = useState<string | null>(faq[0]?.id ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/console/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, message, priority }),
      });
      const data = (await res.json()) as { error?: string; ticket?: ConsoleSupportTicket };
      if (!res.ok) throw new Error(data.error ?? "Could not submit ticket");
      if (data.ticket) setTickets((prev) => [data.ticket!, ...prev]);
      toast.success("Support ticket submitted");
      setSubject("");
      setMessage("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <AdminSection
        title="Submit a ticket"
        description="Describe billing, balance, or send issues. Admin replies appear below."
        icon={MessageSquarePlus}
      >
        <form onSubmit={submit} className="space-y-3 p-4 sm:p-5">
          <label className="block text-sm font-medium text-slate-200">
            Subject
            <Input
              className="mt-1 border-white/10 bg-white/5 text-white"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              maxLength={120}
            />
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Priority
            <select
              className="mt-1 flex h-10 w-full rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="low" className="text-slate-900">Low</option>
              <option value="medium" className="text-slate-900">Medium</option>
              <option value="high" className="text-slate-900">High</option>
              <option value="urgent" className="text-slate-900">Urgent</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-200">
            Message
            <textarea
              className="mt-1 min-h-[120px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              maxLength={4000}
            />
          </label>
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit ticket"}
          </Button>
        </form>
      </AdminSection>

      <AdminSection title="Your tickets" icon={LifeBuoy}>
        {tickets.length === 0 ? (
          <AdminEmptyState
            icon={LifeBuoy}
            title="No tickets yet"
            description="Open a ticket if you need help with your data console account."
          />
        ) : (
          <AdminDataTable minWidth="640px">
            <AdminTableHead>
              <AdminTh>Subject</AdminTh>
              <AdminTh>Status</AdminTh>
              <AdminTh>Date</AdminTh>
              <AdminTh>Reply</AdminTh>
            </AdminTableHead>
            <AdminTableBody>
              {tickets.map((t) => (
                <AdminTr key={t.id}>
                  <AdminTd>
                    <p className="font-medium">{t.subject}</p>
                    <p className="mt-1 text-xs text-white/50 line-clamp-2">{t.message}</p>
                  </AdminTd>
                  <AdminTd>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "neutral"}>{t.status}</Badge>
                  </AdminTd>
                  <AdminTd className="whitespace-nowrap text-white/55">
                    {format(new Date(t.createdAt), "yyyy-MM-dd HH:mm")}
                  </AdminTd>
                  <AdminTd className="text-sm text-white/70">{t.adminReply ?? "—"}</AdminTd>
                </AdminTr>
              ))}
            </AdminTableBody>
          </AdminDataTable>
        )}
      </AdminSection>

      {faq.length > 0 && (
        <AdminSection title="FAQ" description="Common questions about the data console.">
          <div className="divide-y divide-white/10 p-2 sm:p-4">
            {faq.map((item) => {
              const open = openFaq === item.id;
              return (
                <div key={item.id} className="py-2">
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 text-left text-sm font-semibold text-white"
                    onClick={() => setOpenFaq(open ? null : item.id)}
                  >
                    {item.question}
                    <span className="text-white/40">{open ? "−" : "+"}</span>
                  </button>
                  {open && <p className="mt-2 text-sm text-white/65">{item.answer}</p>}
                </div>
              );
            })}
          </div>
        </AdminSection>
      )}
    </div>
  );
}
