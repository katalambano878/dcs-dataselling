import { AlertTriangle, Scale } from "lucide-react";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import {
  AdminConfigError,
  AdminEmptyState,
  AdminList,
  AdminListItem,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { DisputeActions } from "./dispute-actions";

export const dynamic = "force-dynamic";

interface DisputeRow {
  id: string;
  order_id: string;
  order_reference: string;
  reason: string;
  status: string;
  resolution: string | null;
  created_at: string;
}

export default async function AdminDisputesPage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  let disputes: DisputeRow[] = [];

  {
    const service = createServiceClient();
    const { data, error } = await service
      .from("disputes")
      .select(
        `
        id, order_id, reason, status, resolution, created_at,
        orders ( reference )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error && data) {
      disputes = data.map((row: Record<string, unknown>) => {
        const r = row as {
          id: string;
          order_id: string;
          reason: string;
          status: string;
          resolution: string | null;
          created_at: string;
          orders: { reference: string } | { reference: string }[] | null;
        };
        const orderRef = Array.isArray(r.orders)
          ? r.orders[0]?.reference
          : r.orders?.reference;
        return {
          id: r.id,
          order_id: r.order_id,
          order_reference: orderRef ?? r.order_id.slice(0, 8),
          reason: r.reason,
          status: r.status,
          resolution: r.resolution,
          created_at: r.created_at,
        };
      });
    }
  }

  const open = disputes.filter((d) => d.status === "open");

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Customer disputes"
        description="Review order disputes and record resolutions for buyer trust."
        meta={`${open.length} open · ${disputes.length} total`}
      />

      <AdminSection title="Dispute inbox" description="Open cases need a resolution or refund decision." icon={Scale}>
        {disputes.length === 0 ? (
          <AdminEmptyState
            icon={Scale}
            title="No disputes"
            description="When customers raise issues on orders, they'll appear here for review."
            tone="success"
          />
        ) : (
          <AdminList>
            {disputes.map((d) => (
              <AdminListItem key={d.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-amber-800">{d.order_reference}</p>
                    <p className="mt-1 text-sm font-medium">{d.reason}</p>
                    {d.resolution && (
                      <p className="mt-2 text-xs text-muted">
                        <span className="font-semibold">Resolution:</span> {d.resolution}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted">
                      {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                    </p>
                  </div>
                  <Badge variant={d.status === "open" ? "warning" : "success"}>
                    {d.status}
                  </Badge>
                </div>
                {d.status === "open" && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <DisputeActions disputeId={d.id} />
                  </div>
                )}
              </AdminListItem>
            ))}
          </AdminList>
        )}
      </AdminSection>

      {open.length > 0 && (
        <div className="banner-info">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h4 className="font-bold text-amber-900">
              {open.length} open dispute{open.length === 1 ? "" : "s"} need attention
            </h4>
            <p className="text-xs text-amber-800">
              Resolve or escalate before they affect vendor ratings.
            </p>
          </div>
        </div>
      )}
    </AdminPageRoot>
  );
}
