import { useListOrders, useUpdateOrderStatus, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime, getCountdown, playNotificationSound } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw } from "lucide-react";

export default function Kitchen() {
  const qc = useQueryClient();
  const prevOrderIds = useRef<Set<number>>(new Set());
  const [countdowns, setCountdowns] = useState<Record<number, string>>({});

  const { data: orders = [], isLoading } = useListOrders(
    { status: "pending,preparing,ready" },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: "pending,preparing,ready" }) } }
  );

  const updateStatus = useUpdateOrderStatus();

  // Play sound on new orders
  useEffect(() => {
    const currentIds = new Set(orders.map(o => o.id));
    const hasNew = orders.some(o => !prevOrderIds.current.has(o.id));
    if (hasNew && prevOrderIds.current.size > 0) {
      playNotificationSound();
    }
    prevOrderIds.current = currentIds;
  }, [orders]);

  // Countdown tick
  useEffect(() => {
    const interval = setInterval(() => {
      const updated: Record<number, string> = {};
      orders.forEach(o => { updated[o.id] = getCountdown(o.readyTime); });
      setCountdowns(updated);
    }, 1000);
    return () => clearInterval(interval);
  }, [orders]);

  const changeStatus = (id: number, status: string) => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: "pending,preparing,ready" }) }),
    });
  };

  const pending = orders.filter(o => o.status === "pending");
  const preparing = orders.filter(o => o.status === "preparing");
  const ready = orders.filter(o => o.status === "ready");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-background">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Kitchen Display</h1>
          <p className="text-sm text-muted-foreground">{orders.length} active orders</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {orders.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Clock size={48} className="mb-4 opacity-40" />
          <p className="text-lg font-medium">No active orders</p>
          <p className="text-sm">Waiting for new orders...</p>
        </div>
      )}

      {/* Pending column */}
      {pending.length > 0 && (
        <Section title="Pending" count={pending.length} color="text-amber-400">
          {pending.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-amber-500/40 bg-amber-500/5"
              badge="status-pending"
              onPrepare={() => changeStatus(order.id, "preparing")}
              onCancel={() => changeStatus(order.id, "cancelled")}
              showPrepare
            />
          ))}
        </Section>
      )}

      {/* Preparing column */}
      {preparing.length > 0 && (
        <Section title="Preparing" count={preparing.length} color="text-blue-400">
          {preparing.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-blue-500/40 bg-blue-500/5"
              badge="status-preparing"
              onReady={() => changeStatus(order.id, "ready")}
              onCancel={() => changeStatus(order.id, "cancelled")}
              showReady
            />
          ))}
        </Section>
      )}

      {/* Ready column */}
      {ready.length > 0 && (
        <Section title="Ready for Pickup" count={ready.length} color="text-green-400">
          {ready.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-green-500/40 bg-green-500/5"
              badge="status-ready"
              onComplete={() => changeStatus(order.id, "completed")}
              showComplete
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className={cn("text-lg font-bold mb-3", color)}>
        {title} <span className="text-muted-foreground font-normal text-sm">({count})</span>
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {children}
      </div>
    </div>
  );
}

type OrderType = NonNullable<ReturnType<typeof useListOrders>["data"]>[number];

function OrderCard({
  order, countdown, statusColor, badge,
  onPrepare, onReady, onComplete, onCancel,
  showPrepare, showReady, showComplete,
}: {
  order: OrderType; countdown: string; statusColor: string; badge: string;
  onPrepare?: () => void; onReady?: () => void; onComplete?: () => void; onCancel?: () => void;
  showPrepare?: boolean; showReady?: boolean; showComplete?: boolean;
}) {
  const isOverdue = countdown === "Overdue";

  return (
    <div className={cn("border rounded-xl p-4 space-y-3", statusColor, isOverdue && "border-red-500/50 bg-red-500/5")}>
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
          <p className="text-xl font-bold text-foreground mt-0.5">{order.customerName}</p>
          <p className="text-sm text-muted-foreground capitalize">{order.orderType.replace("_", " ")}</p>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-bold tabular-nums", isOverdue ? "text-red-400" : "text-primary")}>
            {countdown}
          </div>
          <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
        </div>
      </div>

      {/* Items */}
      <div className="space-y-1.5 border-t border-border/40 pt-3">
        {order.items.map(item => (
          <div key={item.id} className="flex items-start justify-between">
            <span className="text-base font-medium text-foreground">{item.productName}</span>
            <span className="text-lg font-bold text-primary ml-3 shrink-0">x{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          {order.notes}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {showPrepare && (
          <button onClick={onPrepare} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Start Preparing
          </button>
        )}
        {showReady && (
          <button onClick={onReady} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Mark Ready
          </button>
        )}
        {showComplete && (
          <button onClick={onComplete} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition-colors">
            Completed
          </button>
        )}
        {onCancel && (
          <button onClick={onCancel} className="px-3 py-2.5 bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
