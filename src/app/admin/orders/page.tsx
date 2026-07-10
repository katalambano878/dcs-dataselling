import { ClipboardList } from "lucide-react";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import {
  countAdminOrderBoardByNetwork,
  fetchAdminOrderBoardRows,
  type AdminOrdersFilterStatus,
  type AdminOrdersNetworkFilter,
} from "@/lib/data/admin-orders-board";
import {
  AdminConfigError,
  AdminPageIntro,
  AdminPageRoot,
  AdminStatGrid,
  AdminStatTile,
} from "@/components/admin";
import { AdminOrdersBoard } from "./admin-orders-board";

export const dynamic = "force-dynamic";

const VALID_STATUS = new Set([
  "all",
  "queued",
  "processing",
  "fulfilled",
  "failed",
  "refunded",
  "paid",
  "pending",
]);

const VALID_KIND = new Set(["all", "wholesale", "customer"]);
const VALID_NETWORK = new Set(["all", "mtn", "telecel", "at"]);

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string; network?: string; q?: string }>;
}) {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const params = await searchParams;
  const status = VALID_STATUS.has(params.status ?? "")
    ? (params.status as AdminOrdersFilterStatus)
    : "all";
  const kind = VALID_KIND.has(params.kind ?? "")
    ? (params.kind as "all" | "wholesale" | "customer")
    : "all";
  const network = VALID_NETWORK.has(params.network ?? "")
    ? (params.network as AdminOrdersNetworkFilter)
    : "all";
  const q = params.q ?? "";

  const allRows = await fetchAdminOrderBoardRows({ status, kind, q });
  const networkCounts = countAdminOrderBoardByNetwork(allRows);
  const rows =
    network === "all" ? allRows : allRows.filter((r) => r.network === network);

  const processing = rows.filter((r) =>
    ["queued", "processing", "pending", "paid"].includes(r.orderStatus),
  ).length;
  const undelivered = rows.filter((r) => r.orderStatus === "failed").length;

  const networkLabel =
    network === "all"
      ? "All networks"
      : network === "mtn"
        ? "MTN"
        : network === "telecel"
          ? "Telecel"
          : "AT";

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Order pipeline"
        description="Filter by network, bulk-update, or export Number + Volume CSV — one network at a time for manual fulfilment."
        meta={`${rows.length} rows · ${networkLabel} · ${processing} in progress · ${undelivered} undelivered`}
      />

      <AdminStatGrid>
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="sky"
          label="Visible rows"
          value={String(rows.length)}
          hint={networkLabel}
        />
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="amber"
          label="In progress"
          value={String(processing)}
          hint="Queued / processing"
        />
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="gold"
          label="Undelivered"
          value={String(undelivered)}
          hint="Failed lines"
        />
      </AdminStatGrid>

      <AdminOrdersBoard
        rows={rows}
        initialStatus={status}
        initialKind={kind}
        initialNetwork={network}
        initialQ={q}
        networkCounts={networkCounts}
      />
    </AdminPageRoot>
  );
}
