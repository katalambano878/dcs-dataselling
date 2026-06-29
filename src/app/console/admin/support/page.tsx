import { LifeBuoy } from "lucide-react";
import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleAdminSupportBoard } from "@/components/console/console-admin-support-board";
import { fetchAdminConsoleSupportTickets } from "@/lib/console/support-admin";

export const dynamic = "force-dynamic";

export default async function ConsoleAdminSupportPage() {
  const tickets = await fetchAdminConsoleSupportTickets("all");
  const open = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Staff"
        description="Review and reply to agent support tickets from the data console."
        meta={`${tickets.length} total · ${open} open`}
      />
      <ConsoleAdminSupportBoard initialTickets={tickets} />
    </AdminPageRoot>
  );
}
