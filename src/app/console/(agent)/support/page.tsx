import { AdminPageIntro, AdminPageRoot } from "@/components/admin";
import { ConsoleSupportBoard } from "@/components/console/console-support-board";
import { getCurrentVendor } from "@/lib/auth/session";
import { fetchConsoleFaq, fetchConsoleSupportTickets } from "@/lib/console/support";

export const dynamic = "force-dynamic";

export default async function ConsoleSupportPage() {
  const vendor = await getCurrentVendor();
  const [tickets, faq] = vendor
    ? await Promise.all([
        fetchConsoleSupportTickets(vendor.id),
        fetchConsoleFaq(),
      ])
    : [[], await fetchConsoleFaq()];

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Support"
        description="Open a ticket for console balance, billing, or send issues."
        meta={`${tickets.length} ticket${tickets.length === 1 ? "" : "s"}`}
      />
      <ConsoleSupportBoard initialTickets={tickets} faq={faq} />
    </AdminPageRoot>
  );
}
