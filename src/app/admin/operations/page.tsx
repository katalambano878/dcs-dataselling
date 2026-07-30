import { Activity, CheckCircle2, Clock, Layers } from "lucide-react";
import { createServiceClient, hasSupabaseConfig } from "@/lib/supabase/server";
import { fetchAdminOverview } from "@/lib/data/admin-queries";
import {
  AdminConfigError,
  AdminEmptyState,
  AdminList,
  AdminListItem,
  AdminPageIntro,
  AdminPageRoot,
  AdminSection,
  AdminStatGrid,
  AdminStatTile,
} from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { formatGHS, formatPhone } from "@/lib/format";
import { QueueActions } from "./queue-actions";

export const dynamic = "force-dynamic";

interface QueueRow {
  id: string;
  reference: string;
  recipient_phone: string;
  amount: number;
  status: string;
  vendor_name: string;
  waiting_minutes: number;
}

export default async function AdminOperationsPage() {
  if (!hasSupabaseConfig()) {
    return <AdminConfigError />;
  }

  const metrics = await fetchAdminOverview();
  let queue: QueueRow[] = [];

  {
    const service = createServiceClient();
    const { data } = await service
      .from("orders")
      .select(
        `
        id, reference, recipient_phone, amount, status, created_at,
        vendors!inner ( business_name )
      `,
      )
      .in("status", ["paid", "queued", "processing"])
      .order("created_at", { ascending: true })
      .limit(50);

    if (data) {
      queue = data.map((row: Record<string, unknown>) => {
        const r = row as {
          id: string;
          reference: string;
          recipient_phone: string;
          amount: number;
          status: string;
          created_at: string;
          vendors: { business_name: string } | { business_name: string }[];
        };
        const vendorName = Array.isArray(r.vendors)
          ? r.vendors[0]?.business_name
          : r.vendors.business_name;
        const waiting = Math.max(
          0,
          Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60000),
        );
        return {
          id: r.id,
          reference: r.reference,
          recipient_phone: r.recipient_phone,
          amount: Number(r.amount),
          status: r.status,
          vendor_name: vendorName ?? "Vendor",
          waiting_minutes: waiting,
        };
      });
    }
  }

  const successRate = metrics?.successRate ?? 0;

  return (
    <AdminPageRoot>
      <AdminPageIntro
        badge="Live ops"
        description="Fulfilment queue and real-time platform health — reconcile stuck orders here."
        meta={`${queue.length} in queue · ${successRate.toFixed(1)}% payment success`}
      />

      <AdminStatGrid>
        <AdminStatTile
          icon={<Layers className="h-4 w-4" />}
          tone="amber"
          label="Queue depth"
          value={String(queue.length)}
        />
        <AdminStatTile
          icon={<Clock className="h-4 w-4" />}
          tone="sky"
          label="Orders today"
          value={String(metrics?.ordersToday ?? 0)}
        />
        <AdminStatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone="emerald"
          label="Fulfilled today"
          value={String(metrics?.ordersFulfilledToday ?? 0)}
          valueAccent="emerald"
        />
        <AdminStatTile
          icon={<Activity className="h-4 w-4" />}
          tone="gold"
          label="Success rate"
          value={`${successRate}%`}
          valueAccent="gold"
        />
      </AdminStatGrid>

      <AdminSection
        title="Fulfilment queue"
        description="Orders awaiting vendor fulfilment or manual intervention."
        icon={Layers}
      >
        {queue.length === 0 ? (
          <AdminEmptyState
            icon={CheckCircle2}
            title="Queue is clear"
            description="No orders waiting for fulfilment. You're all caught up."
            tone="success"
          />
        ) : (
          <AdminList>
            {queue.map((item) => (
              <AdminListItem key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-amber-800">{item.reference}</p>
                    <p className="text-sm text-foreground">
                      {item.vendor_name} · {formatGHS(item.amount)}
                    </p>
                    <p className="text-xs text-muted">
                      {formatPhone(item.recipient_phone)} · waiting {item.waiting_minutes}m
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{item.status}</Badge>
                    <QueueActions orderId={item.id} />
                  </div>
                </div>
              </AdminListItem>
            ))}
          </AdminList>
        )}
      </AdminSection>
    </AdminPageRoot>
  );
}
