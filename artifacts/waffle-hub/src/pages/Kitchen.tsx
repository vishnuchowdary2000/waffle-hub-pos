import {
  useListOrders,
  useUpdateOrderStatus,
  getListOrdersQueryKey,
  type ListOrdersQueryResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playNotificationSound } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import {
  Clock, RefreshCw, ChefHat, ShoppingBag,
  UtensilsCrossed, Zap,
} from "lucide-react";

const ACTIVE_STATUSES = "approved,preparing,ready";

type Order = ListOrdersQueryResult[number];

const STATUS_META: Record<string, { label: string; cardBorder: string; badge: string }> = {
  approved:  { label: "New",       cardBorder: "border-violet-500/50 bg-violet-500/5", badge: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  preparing: { label: "Preparing", cardBorder: "border-blue-500/50 bg-blue-500/5",     badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  ready:     { label: "Ready ✓",   cardBorder: "border-green-500/50 bg-green-500/5",   badge: "bg-green-500/20 text-green-300 border-green-500/30" },
};

function elapsed(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function sortOrders(orders: Order[]) {
  return [...orders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export default function Kitchen() {
  const qc = useQueryClient();
  const prevIds = useRef<Set<number>>(new Set());
  const [tick, setTick] = useState(0);

  const { data: orders = [], isLoading } = useListOrders(
    { status: ACTIVE_STATUSES },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) } }
  );

  const updateStatus = useUpdateOrderStatus();

  useEffect(() => {
    const cur = new Set(orders.map(o => o.id));
    if (prevIds.current.size > 0 && orders.some(o => !prevIds.current.has(o.id))) {
      playNotificationSound();
    }
    prevIds.current = cur;
  }, [orders]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  void tick;

  const changeStatus = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) }) }
    );
  };

  // Split by item-level types — a mixed order appears in both columns
  const dineIn   = sortOrders(orders.filter(o => o.items.some(i => i.itemOrderType === "dine_in")));
  const takeaway = sortOrders(orders.filter(o => o.items.some(i => i.itemOrderType !== "dine_in")));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <ChefHat size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">
              Current Active Orders:&nbsp;
              <span className="font-bold text-foreground">{orders.length}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="animate-spin text-primary" size={28} />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Clock size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">No active orders</p>
          <p className="text-sm">Waiting for new orders…</p>
        </div>
      ) : (
        /* Two-column split: Dine In | Takeaway */
        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[calc(100vh-72px)]">

          {/* ── Dine In ─────────────────────────────────── */}
          <div className="border-r border-border p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1">
              <UtensilsCrossed size={15} className="text-primary" />
              <h2 className="font-bold text-base text-foreground">Dine In</h2>
              <span className="ml-auto text-xs font-semibold bg-primary/15 text-primary px-2.5 py-0.5 rounded-full border border-primary/25">
                {dineIn.length}
              </span>
            </div>

            {dineIn.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
                <UtensilsCrossed size={32} className="mb-2" />
                <p className="text-sm">No dine-in orders</p>
              </div>
            ) : (
              dineIn.map(order => (
                <KitchenCard
                  key={order.id}
                  order={order}
                  filterType="dine_in"
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onReady={() => changeStatus(order.id, "ready")}
                />
              ))
            )}
          </div>

          {/* ── Takeaway ────────────────────────────────── */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1">
              <ShoppingBag size={15} className="text-blue-400" />
              <h2 className="font-bold text-base text-foreground">Takeaway</h2>
              <span className="ml-auto text-xs font-semibold bg-blue-500/15 text-blue-400 px-2.5 py-0.5 rounded-full border border-blue-500/25">
                {takeaway.length}
              </span>
            </div>

            {takeaway.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
                <ShoppingBag size={32} className="mb-2" />
                <p className="text-sm">No takeaway orders</p>
              </div>
            ) : (
              takeaway.map(order => (
                <KitchenCard
                  key={order.id}
                  order={order}
                  filterType="takeaway"
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onReady={() => changeStatus(order.id, "ready")}
                />
              ))
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function KitchenCard({
  order,
  filterType,
  onPrepare,
  onReady,
}: {
  order: Order;
  filterType: "dine_in" | "takeaway";
  onPrepare: () => void;
  onReady: () => void;
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.approved;

  // Show only items relevant to this column
  const visibleItems = order.items.filter(item =>
    filterType === "dine_in" ? item.itemOrderType === "dine_in" : item.itemOrderType !== "dine_in"
  );

  // Flag: this order also has items in the other column
  const isMixed = order.items.some(i => i.itemOrderType === "dine_in") &&
                  order.items.some(i => i.itemOrderType !== "dine_in");

  return (
    <div
      className={cn(
        "border rounded-2xl p-4 space-y-3 transition-all",
        meta.cardBorder,
        order.priority && "ring-2 ring-amber-500/40"
      )}
    >
      {/* Top row: status badge + order number + elapsed */}
      <div className="flex items-center gap-2 flex-wrap">
        {order.priority && (
          <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <Zap size={11} fill="currentColor" /> PRIORITY
          </span>
        )}
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", meta.badge)}>
          {meta.label}
        </span>
        <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
        {isMixed && (
          <span className="text-xs font-semibold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full">
            Mixed order
          </span>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Clock size={11} />
          {elapsed(order.createdAt)}
        </span>
      </div>

      {/* Customer name */}
      <div>
        <p className="text-2xl font-black text-foreground leading-tight tracking-tight">
          {order.customerName}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {filterType === "dine_in"
            ? <span className="flex items-center gap-1"><UtensilsCrossed size={11} /> Dine In portion</span>
            : <span className="flex items-center gap-1"><ShoppingBag size={11} /> Takeaway portion</span>
          }
        </p>
      </div>

      {/* Items — only the relevant type for this column */}
      <div className="space-y-1 border-t border-border/40 pt-3">
        {visibleItems.map(item => (
          <div key={item.id} className="flex items-baseline justify-between gap-2">
            <span className="text-base font-medium text-foreground leading-snug">
              {item.productName}
            </span>
            <span className="text-xl font-black text-primary shrink-0">×{item.quantity}</span>
          </div>
        ))}
      </div>

      {/* Notes */}
      {order.notes && (
        <div className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          📝 {order.notes}
        </div>
      )}

      {/* Action buttons — kitchen only does Prepare & Ready */}
      <div className="pt-1">
        {order.status === "approved" && (
          <button
            onClick={onPrepare}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Start Preparing
          </button>
        )}
        {order.status === "preparing" && (
          <button
            onClick={onReady}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Mark Ready
          </button>
        )}
        {order.status === "ready" && (
          <div className="w-full py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm font-bold text-green-400 text-center">
            ✓ Ready — awaiting handover
          </div>
        )}
      </div>
    </div>
  );
}
