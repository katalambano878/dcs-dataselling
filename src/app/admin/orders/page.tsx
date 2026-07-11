import { ClipboardList } from "lucide-react";
import { hasSupabaseConfig } from "@/lib/supabase/server";
import {
  countAdminOrderBoardByNetwork,
  fetchAdminOrderBoardAgents,
  fetchAdminOrderBoardRows,
  type AdminOrdersFilterStatus,
  type AdminOrdersNetworkFilter,
} from "@/lib/data/admin-orders-board";
import {
  isEffectivelyFailed,
  isEffectivelyFulfilled,
  isWorkQueueOrderStatus,
} from "@/lib/admin/order-board-status";
import {
  ADMIN_ORDERS_DATE_PRESETS,
  ADMIN_ORDERS_ENTRY_LIMITS,
  DEFAULT_ADMIN_ORDERS_LIMIT,
  resolveAdminOrdersDateRange,
  type AdminOrdersDatePeriod,
} from "@/lib/admin/order-board-date";
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
const VALID_PERIOD = new Set<string>(ADMIN_ORDERS_DATE_PRESETS.map((p) => p.value));
const VALID_PAY_STATUS = new Set(["completed", "pending", "refunded", "failed"]);

function parseLimit(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_ADMIN_ORDERS_LIMIT;
  const allowed = ADMIN_ORDERS_ENTRY_LIMITS as readonly number[];
  return allowed.includes(n) ? n : DEFAULT_ADMIN_ORDERS_LIMIT;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    kind?: string;
    network?: string;
    q?: string;
    period?: string;
    from?: string;
    to?: string;
    limit?: string;
    agent?: string;
    payment?: string;
    pay_status?: string;
  }>;
}) {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const params = await searchParams;
  const rawStatus = VALID_STATUS.has(params.status ?? "")
    ? (params.status as AdminOrdersFilterStatus)
    : "all";
  const status = rawStatus === "queued" ? "processing" : rawStatus;
  const kind = VALID_KIND.has(params.kind ?? "")
    ? (params.kind as "all" | "wholesale" | "customer")
    : "all";
  const network = VALID_NETWORK.has(params.network ?? "")
    ? (params.network as AdminOrdersNetworkFilter)
    : "all";
  const q = params.q ?? "";
  const period = VALID_PERIOD.has(params.period ?? "")
    ? (params.period as AdminOrdersDatePeriod)
    : "today";
  const fromDate = params.from ?? "";
  const toDate = params.to ?? "";
  const limit = parseLimit(params.limit);
  const agent = params.agent ?? "";
  const payment = params.payment ?? "";
  const payStatus = VALID_PAY_STATUS.has(params.pay_status ?? "")
    ? (params.pay_status as string)
    : "";

  const dateRange = resolveAdminOrdersDateRange({ period, fromDate, toDate });

  const [allRows, agents] = await Promise.all([
    fetchAdminOrderBoardRows({
      status,
      kind,
      q,
      limit,
      period,
      fromDate: dateRange.fromDate ?? undefined,
      toDate: dateRange.toDate ?? undefined,
      agentSlug: agent || undefined,
      paymentMethod: payment || undefined,
      paymentStatus: payStatus || undefined,
    }),
    fetchAdminOrderBoardAgents(),
  ]);

  const networkCounts = countAdminOrderBoardByNetwork(allRows);
  const rows =
    network === "all" ? allRows : allRows.filter((r) => r.network === network);

  const processing = rows.filter(
    (r) =>
      isWorkQueueOrderStatus(r.orderStatus) &&
      !isEffectivelyFulfilled(r) &&
      !isEffectivelyFailed(r),
  ).length;
  const undelivered = rows.filter((r) => isEffectivelyFailed(r)).length;

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
        description="Today's orders by default — widen the date range or filters to pull older history."
        meta={`${rows.length} rows · ${networkLabel} · ${dateRange.label} · ${processing} in progress · ${undelivered} undelivered`}
      />

      <AdminStatGrid>
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="sky"
          label="Visible rows"
          value={String(rows.length)}
          hint={`${networkLabel} · max ${limit}`}
        />
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="amber"
          label="In progress"
          value={String(processing)}
          hint="Work queue — excludes paid + API-delivered"
        />
        <AdminStatTile
          icon={<ClipboardList className="h-4 w-4" />}
          tone="gold"
          label="Undelivered"
          value={String(undelivered)}
          hint="Failed lines — payment or API failed"
        />
      </AdminStatGrid>

      <AdminOrdersBoard
        rows={rows}
        initialStatus={status}
        initialKind={kind}
        initialNetwork={network}
        initialQ={q}
        initialPeriod={period}
        initialFromDate={dateRange.fromDate ?? ""}
        initialToDate={dateRange.toDate ?? ""}
        initialLimit={limit}
        initialAgent={agent}
        initialPayment={payment}
        initialPayStatus={payStatus}
        dateLabel={dateRange.label}
        agents={agents}
        networkCounts={networkCounts}
      />
    </AdminPageRoot>
  );
}
