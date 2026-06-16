import { useListOrders, useUpdateOrderStatus, getListOrdersQueryKey, type ListOrdersQueryResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatTime, getCountdown, playNotificationSound } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  Clock, RefreshCw, AlertTriangle, X, Trash2,
  ChevronDown, ChevronUp, ClipboardList,
  LayoutGrid, List, ShoppingBag, Phone,
  Plus, Minus, RotateCcw,
} from "lucide-react";

type ViewMode = "orders" | "batch";
type ConfirmState = { orderId: number; orderNumber: string; customerName: string } | null;

const ACTIVE_STATUSES = "approved,preparing,ready";

export default function Kitchen() {
  const qc = useQueryClient();
  const prevOrderIds = useRef<Set<number>>(new Set());
  const [countdowns, setCountdowns] = useState<Record<number, string>>({});
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [prepOpen, setPrepOpen] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("orders");
  const [prepared, setPrepared] = useState<Record<string, number>>({});

  const { data: orders = [], isLoading } = useListOrders(
    { status: ACTIVE_STATUSES },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) } }
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
      onSuccess: () => qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) }),
    });
  };

  const approved  = orders.filter(o => o.status === "approved");
  const preparing = orders.filter(o => o.status === "preparing");
  const ready     = orders.filter(o => o.status === "ready");

  // Batch view: aggregate items from approved + preparing
  const activeOrders = orders.filter(o => o.status === "approved" || o.status === "preparing");
  const batchMap = new Map<string, number>();
  for (const order of activeOrders) {
    for (const item of order.items) {
      batchMap.set(item.productName, (batchMap.get(item.productName) ?? 0) + item.quantity);
    }
  }
  const batchItems = Array.from(batchMap.entries())
    .map(([name, needed]) => ({ name, needed, preparedCount: prepared[name] ?? 0, remaining: needed - (prepared[name] ?? 0) }))
    .sort((a, b) => b.remaining - a.remaining);

  const adjustPrepared = (name: string, delta: number) =>
    setPrepared(prev => ({ ...prev, [name]: Math.max(0, (prev[name] ?? 0) + delta) }));
  const resetPrepared = (name: string) =>
    setPrepared(prev => { const n = { ...prev }; delete n[name]; return n; });

  if (isLoading) {
    return <div className="flex items-center justify-center h-full bg-background"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Kitchen Display</h1>
          <p className="text-sm text-muted-foreground">
            {orders.length} active · {approved.length} approved · {preparing.length} preparing · {ready.length} ready
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-secondary rounded-lg p-1">
            <button onClick={() => setViewMode("orders")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "orders" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <List size={13} /> Orders
            </button>
            <button onClick={() => setViewMode("batch")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors",
                viewMode === "batch" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              <LayoutGrid size={13} /> Batch
            </button>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        </div>
      </div>

      {/* ── BATCH VIEW ── */}
      {viewMode === "batch" && (
        <div className="space-y-4">
          {batchItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <ClipboardList size={48} className="mb-4 opacity-40" />
              <p className="text-lg font-medium">No items to prepare</p>
              <p className="text-sm">Waiting for orders...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Tap + when you prepare a batch. Negative = extra stock available.</p>
                {Object.keys(prepared).length > 0 && (
                  <button onClick={() => setPrepared({})} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1">
                    <RotateCcw size={12} /> Reset All
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {batchItems.map(item => (
                  <div key={item.name}
                    className={cn("bg-card border rounded-2xl p-5 space-y-4",
                      item.remaining < 0 ? "border-green-500/40 bg-green-500/5" :
                      item.remaining === 0 ? "border-muted bg-secondary/30" :
                      item.remaining <= 3 ? "border-amber-500/40 bg-amber-500/5" : "border-card-border")}>
                    <div>
                      <p className="font-bold text-foreground text-base leading-snug">{item.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Needed: {item.needed}</p>
                    </div>
                    <div className="text-center py-2">
                      <p className={cn("text-6xl font-black tabular-nums",
                        item.remaining < 0 ? "text-green-400" :
                        item.remaining === 0 ? "text-muted-foreground" :
                        item.remaining <= 3 ? "text-amber-400" : "text-foreground")}>
                        {item.remaining < 0 ? `+${Math.abs(item.remaining)}` : item.remaining}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.remaining < 0 ? "extra stock" : item.remaining === 0 ? "all prepared ✓" : "still needed"}
                      </p>
                    </div>
                    {item.preparedCount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Prepared</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-primary">{item.preparedCount}</span>
                          <button onClick={() => resetPrepared(item.name)} className="text-muted-foreground hover:text-destructive">
                            <RotateCcw size={12} />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <button onClick={() => adjustPrepared(item.name, -1)}
                        className="py-3 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-lg flex items-center justify-center transition-colors">
                        <Minus size={16} />
                      </button>
                      <button onClick={() => adjustPrepared(item.name, item.remaining > 0 ? item.remaining : 1)}
                        className="py-3 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary font-bold text-xs flex items-center justify-center transition-colors">
                        Batch
                      </button>
                      <button onClick={() => adjustPrepared(item.name, 1)}
                        className="py-3 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-bold text-lg flex items-center justify-center transition-colors">
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── ORDERS VIEW ── */}
      {viewMode === "orders" && (
        <>
          {/* Prep summary */}
          {batchItems.length > 0 && (
            <div className="bg-amber-500/8 border border-amber-500/25 rounded-xl overflow-hidden">
              <button onClick={() => setPrepOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left">
                <div className="flex items-center gap-2">
                  <ClipboardList size={16} className="text-amber-400" />
                  <span className="font-bold text-sm text-amber-400">
                    Prep List — {activeOrders.length} active order{activeOrders.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {prepOpen ? <ChevronUp size={15} className="text-amber-400" /> : <ChevronDown size={15} className="text-amber-400" />}
              </button>
              {prepOpen && (
                <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {batchItems.map(item => (
                    <div key={item.name} className="bg-background/60 border border-amber-500/20 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground leading-tight truncate">{item.name}</span>
                      <span className="text-xl font-bold text-amber-400 shrink-0">×{item.needed}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {orders.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Clock size={48} className="mb-4 opacity-40" />
              <p className="text-lg font-medium">No active orders</p>
              <p className="text-sm">Waiting for new orders...</p>
            </div>
          )}

          {approved.length > 0 && (
            <Section title="Approved — Ready to Cook" count={approved.length} color="text-violet-400">
              {approved.map(order => (
                <OrderCard key={order.id} order={order} countdown={countdowns[order.id] ?? ""}
                  statusColor="border-violet-500/40 bg-violet-500/5"
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onCancelRequest={() => setConfirm({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
                  showPrepare />
              ))}
            </Section>
          )}

          {preparing.length > 0 && (
            <Section title="Preparing" count={preparing.length} color="text-blue-400">
              {preparing.map(order => (
                <OrderCard key={order.id} order={order} countdown={countdowns[order.id] ?? ""}
                  statusColor="border-blue-500/40 bg-blue-500/5"
                  onReady={() => changeStatus(order.id, "ready")}
                  onCancelRequest={() => setConfirm({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
                  showReady />
              ))}
            </Section>
          )}

          {ready.length > 0 && (
            <Section title="Ready for Pickup" count={ready.length} color="text-green-400">
              {ready.map(order => (
                <OrderCard key={order.id} order={order} countdown={countdowns[order.id] ?? ""}
                  statusColor="border-green-500/40 bg-green-500/5"
                  onComplete={() => changeStatus(order.id, "completed")}
                  showComplete />
              ))}
            </Section>
          )}
        </>
      )}

      {/* Cancel modal */}
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
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-3 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
                <X size={14} /> Keep
              </button>
              <button onClick={() => { changeStatus(confirm.orderId, "cancelled"); setConfirm(null); }} disabled={updateStatus.isPending}
                className="flex-1 py-3 rounded-xl bg-destructive text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

type OrderType = ListOrdersQueryResult[number];

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
  const hasTakeaway = order.items.some(i => i.itemOrderType === "takeaway");

  return (
    <div className={cn("border rounded-xl p-4 space-y-3", statusColor, isOverdue && "border-red-500/50 bg-red-500/5")}>
      <div className="flex items-start justify-between">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
          <p className="text-xl font-bold text-foreground mt-0.5">{order.customerName}</p>
          {order.customerPhone && (
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <Phone size={11} /> {order.customerPhone}
            </p>
          )}
          <p className="text-xs text-muted-foreground capitalize mt-0.5">{order.orderType.replace("_", " ")}</p>
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-bold tabular-nums", isOverdue ? "text-red-400" : "text-primary")}>
            {countdown}
          </div>
          <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
        </div>
      </div>

      {hasTakeaway && (
        <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1.5">
          <ShoppingBag size={11} /> Packing needed
        </div>
      )}

      <div className="space-y-1.5 border-t border-border/40 pt-3">
        {order.items.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base font-medium text-foreground truncate">{item.productName}</span>
              {item.itemOrderType === "takeaway" && <ShoppingBag size={11} className="text-blue-400 shrink-0" />}
            </div>
            <span className="text-lg font-bold text-primary ml-3 shrink-0">×{item.quantity}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          {order.notes}
        </div>
      )}

      {/* Payment badge */}
      {(() => {
        const p = order.payment;
        if (!p) return (
          <div className="text-xs px-2.5 py-1.5 rounded-lg font-medium w-fit bg-red-500/15 text-red-400 border border-red-500/20">
            ₹{order.totalAmount} — UNPAID
          </div>
        );
        if (p.status === "paid") return (
          <div className="text-xs px-2.5 py-1.5 rounded-lg font-medium w-fit bg-green-500/15 text-green-400 border border-green-500/20">
            ✓ PAID
          </div>
        );
        return (
          <div className="text-xs px-2.5 py-1.5 rounded-lg font-medium w-fit bg-amber-500/15 text-amber-400 border border-amber-500/20">
            Partial — ₹{p.balance?.toFixed(0)} pending
          </div>
        );
      })()}

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
          <button onClick={onCancelRequest}
            className="px-3 py-2.5 bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive rounded-lg text-sm font-medium transition-colors">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
