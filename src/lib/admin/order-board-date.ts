import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

/** Ghana uses GMT year-round — server UTC boundaries match local calendar days. */
const WEEK_STARTS_ON = 1 as const;

export const ADMIN_ORDERS_DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last90", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
] as const;

export type AdminOrdersDatePeriod = (typeof ADMIN_ORDERS_DATE_PRESETS)[number]["value"];

export const ADMIN_ORDERS_ENTRY_LIMITS = [50, 100, 300, 500, 1000] as const;
export const DEFAULT_ADMIN_ORDERS_LIMIT = 300;

export interface AdminOrdersDateRange {
  period: AdminOrdersDatePeriod;
  from: string | null;
  to: string | null;
  fromDate: string | null;
  toDate: string | null;
  label: string;
}

const VALID_PERIODS = new Set<string>(ADMIN_ORDERS_DATE_PRESETS.map((p) => p.value));

function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = parseISO(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveAdminOrdersDateRange(opts: {
  period?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  now?: Date;
}): AdminOrdersDateRange {
  const now = opts.now ?? new Date();
  const period = VALID_PERIODS.has(opts.period ?? "")
    ? (opts.period as AdminOrdersDatePeriod)
    : "today";

  if (period === "all") {
    return {
      period,
      from: null,
      to: null,
      fromDate: null,
      toDate: null,
      label: "All time",
    };
  }

  if (period === "custom") {
    const fromParsed = parseDateOnly(opts.fromDate);
    const toParsed = parseDateOnly(opts.toDate) ?? fromParsed;
    if (!fromParsed || !toParsed) {
      const today = isoDay(now);
      const from = startOfDay(now).toISOString();
      const to = endOfDay(now).toISOString();
      return {
        period: "today",
        from,
        to,
        fromDate: today,
        toDate: today,
        label: `Today (${today})`,
      };
    }
    const start = startOfDay(fromParsed < toParsed ? fromParsed : toParsed);
    const end = endOfDay(fromParsed > toParsed ? fromParsed : toParsed);
    const fromDate = isoDay(start);
    const toDate = isoDay(end);
    return {
      period: "custom",
      from: start.toISOString(),
      to: end.toISOString(),
      fromDate,
      toDate,
      label: fromDate === toDate ? fromDate : `${fromDate} – ${toDate}`,
    };
  }

  let start: Date;
  let end: Date;
  let label: string;

  switch (period) {
    case "yesterday": {
      const day = subDays(now, 1);
      start = startOfDay(day);
      end = endOfDay(day);
      label = `Yesterday (${isoDay(day)})`;
      break;
    }
    case "last7":
      start = startOfDay(subDays(now, 6));
      end = endOfDay(now);
      label = "Last 7 days";
      break;
    case "last30":
      start = startOfDay(subDays(now, 29));
      end = endOfDay(now);
      label = "Last 30 days";
      break;
    case "this_week":
      start = startOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
      end = endOfWeek(now, { weekStartsOn: WEEK_STARTS_ON });
      label = "This week";
      break;
    case "last_week": {
      const prev = subWeeks(now, 1);
      start = startOfWeek(prev, { weekStartsOn: WEEK_STARTS_ON });
      end = endOfWeek(prev, { weekStartsOn: WEEK_STARTS_ON });
      label = "Last week";
      break;
    }
    case "this_month":
      start = startOfMonth(now);
      end = endOfMonth(now);
      label = "This month";
      break;
    case "last_month": {
      const prev = subMonths(now, 1);
      start = startOfMonth(prev);
      end = endOfMonth(prev);
      label = "Last month";
      break;
    }
    case "last90":
      start = startOfDay(subDays(now, 89));
      end = endOfDay(now);
      label = "Last 90 days";
      break;
    case "today":
    default:
      start = startOfDay(now);
      end = endOfDay(now);
      label = `Today (${isoDay(now)})`;
      break;
  }

  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
    fromDate: isoDay(start),
    toDate: isoDay(end),
    label,
  };
}

export function buildAdminOrdersSearchParams(filters: {
  status?: string;
  kind?: string;
  network?: string;
  q?: string;
  period?: string;
  from?: string;
  to?: string;
  limit?: number;
  agent?: string;
  payment?: string;
  payStatus?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== "all") params.set("status", filters.status);
  if (filters.kind && filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.network && filters.network !== "all") params.set("network", filters.network);
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.period && filters.period !== "today") params.set("period", filters.period);
  if (filters.period === "custom" && filters.from) params.set("from", filters.from);
  if (filters.period === "custom" && filters.to) params.set("to", filters.to);
  if (filters.limit && filters.limit !== DEFAULT_ADMIN_ORDERS_LIMIT) {
    params.set("limit", String(filters.limit));
  }
  if (filters.agent) params.set("agent", filters.agent);
  if (filters.payment) params.set("payment", filters.payment);
  if (filters.payStatus) params.set("pay_status", filters.payStatus);
  return params.toString();
}
