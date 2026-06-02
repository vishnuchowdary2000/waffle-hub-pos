import { useListOrders, useUpdateOrderStatus, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime, getCountdown, playNotificationSound } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { Clock, RefreshCw, AlertTriangle, X, Trash2 } from "lucide-react";

type ConfirmState = { orderId: number; orderNumber: string; customerName: string } | null;

export default function Kitchen() {
  const qc = useQueryClient();
  const prevOrderIds = useRef<Set<number>>(new Set());
  const [countdowns, setCountdowns] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const { data: orders = [], isLoading } = useListOrders(
    { status: "pending,preparing,ready" },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: "pending,preparing,ready" }) } }
  );

  const updateStatus = useUpdateOrderStatus();

  useEffect(() => {
    const currentIds = new Set(orders.map(o => o.id));
    const hasNew = orders.some(o => !prevOrderIds.current.has(o.id));
    if (hasNew && prevOrderIds.current.size > 0) playNotificationSound();
    prevOrderIds.current = currentIds;
  }, [orders]);

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

  const handleCancelConfirmed = () => {
    if (!confirm) return;
    changeStatus(confirm.orderId, "cancelled");
    setConfirm(null);
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

      {pending.length > 0 && (
        <Section title="Pending" count={pending.length} color="text-amber-400">
          {pending.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-amber-500/40 bg-amber-500/5"
              onPrepare={() => changeStatus(order.id, "preparing")}
              onCancelRequest={() => setConfirm({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
              showPrepare
            />
          ))}
        </Section>
      )}

      {preparing.length > 0 && (
        <Section title="Preparing" count={preparing.length} color="text-blue-400">
          {preparing.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-blue-500/40 bg-blue-500/5"
              onReady={() => changeStatus(order.id, "ready")}
              onCancelRequest={() => setConfirm({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
              showReady
            />
          ))}
        </Section>
      )}

      {ready.length > 0 && (
        <Section title="Ready for Pickup" count={ready.length} color="text-green-400">
          {ready.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              countdown={countdowns[order.id] ?? ""}
              statusColor="border-green-500/40 bg-green-500/5"
              onComplete={() => changeStatus(order.id, "completed")}
              showComplete
            />
          ))}
        </Section>
      )}

      {/* Cancel confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground text-lg">Cancel this order?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono text-xs">{confirm.orderNumber}</span> — {confirm.customerName}
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  If this customer has no other orders, their record will also be removed.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5"
              >
                <X size={14} /> Keep Order
              </button>
              <button
                onClick={handleCancelConfirmed}
                disabled={updateStatus.isPending}
                className="flex-1 py-3 rounded-xl bg-destructive text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 size={14} /> Cancel Order
              </button>
            </div>
          </div>
        </div>
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
  order, countdown, statusColor,
  onPrepare, onReady, onComplete, onCancelRequest,
  showPrepare, showReady, showComplete,
}: {
  order: OrderType; countdown: string; statusColor: string;
  onPrepare?: () => void; onReady?: () => void; onComplete?: () => void; onCancelRequest?: () => void;
  showPrepare?: boolean; showReady?: boolean; showComplete?: boolean;
}) {
  const isOverdue = countdown === "Overdue";

  return (
    <div className={cn("border rounded-xl p-4 space-y-3", statusColor, isOverdue && "border-red-500/50 bg-red-500/5")}>
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

      <div className="space-y-1.5 border-t border-border/40 pt-3">
        {order.items.map(item => (
          <div key={item.id} className="flex items-start justify-between">
            <span className="text-base font-medium text-foreground">{item.productName}</span>
            <span className="text-lg font-bold text-primary ml-3 shrink-0">x{item.quantity}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          {order.notes}
        </div>
      )}

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
        {onCancelRequest && (
          <button
            onClick={onCancelRequest}
            className="px-3 py-2.5 bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
