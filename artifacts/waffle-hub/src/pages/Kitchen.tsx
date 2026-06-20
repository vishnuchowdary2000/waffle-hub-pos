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
  UtensilsCrossed, Zap, Sparkles, Layers,
} from "lucide-react";

const ACTIVE_STATUSES = "approved,preparing,ready";
const NEW_ITEM_TTL_MS = 45_000; // 45 s highlight window

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

const STATUS_RANK: Record<string, number> = { preparing: 0, approved: 1, ready: 2 };

function sortOrders(orders: Order[]) {
  return [...orders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

export default function Kitchen() {
  const qc = useQueryClient();

  // ── New-order sound tracking (existing) ─────────────────────────────────
  const prevOrderIds = useRef<Set<number>>(new Set());

  // ── Per-order item snapshot: orderId → Set of known item IDs ────────────
  // When an order first arrives, all its items are recorded as "baseline" (no highlight).
  // On subsequent polls, any item ID absent from the snapshot is "new".
  const orderItemSnapshot = useRef<Map<number, Set<number>>>(new Map());

  // ── Highlighted items: itemId → expiry timestamp ─────────────────────────
  const [newItemHighlights, setNewItemHighlights] = useState<Map<number, number>>(new Map());

  const [tick, setTick] = useState(0);

  const { data: orders = [], isLoading } = useListOrders(
    { status: ACTIVE_STATUSES },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) } }
  );

  const updateStatus = useUpdateOrderStatus();

  // ── Detect new orders AND new items within existing orders ───────────────
  useEffect(() => {
    const now = Date.now();
    const currentOrderIds = new Set(orders.map(o => o.id));

    // Sound for brand-new orders (existing behaviour)
    const hasNewOrder = orders.some(o => !prevOrderIds.current.has(o.id));
    if (prevOrderIds.current.size > 0 && hasNewOrder) {
      playNotificationSound();
    }
    prevOrderIds.current = currentOrderIds;

    // Item diff per order
    const addedItemIds: number[] = [];

    for (const order of orders) {
      const knownItems = orderItemSnapshot.current.get(order.id);
      const currentItemIds = new Set(order.items.map(i => i.id));

      if (!knownItems) {
        // Brand-new order — record baseline, no highlighting (whole ticket is new)
        orderItemSnapshot.current.set(order.id, currentItemIds);
      } else {
        // Existing order — find items that weren't there before
        for (const itemId of currentItemIds) {
          if (!knownItems.has(itemId)) {
            addedItemIds.push(itemId);
          }
        }
        // Update snapshot to include new items
        orderItemSnapshot.current.set(order.id, currentItemIds);
      }
    }

    // Clean up snapshots for orders that left the active list
    for (const orderId of orderItemSnapshot.current.keys()) {
      if (!currentOrderIds.has(orderId)) {
        orderItemSnapshot.current.delete(orderId);
      }
    }

    // Apply highlights for newly-added items
    if (addedItemIds.length > 0) {
      playNotificationSound();
      setNewItemHighlights(prev => {
        const next = new Map(prev);
        const expiry = now + NEW_ITEM_TTL_MS;
        for (const id of addedItemIds) next.set(id, expiry);
        return next;
      });
    }
  }, [orders]);

  // ── Expire stale highlights every 5 s ───────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => {
      setNewItemHighlights(prev => {
        const now = Date.now();
        if ([...prev.values()].every(exp => exp > now)) return prev; // nothing to remove
        const next = new Map([...prev].filter(([, exp]) => exp > now));
        return next;
      });
      setTick(x => x + 1); // keep elapsed timers updating
    }, 5000);
    return () => clearInterval(t);
  }, []);

  void tick;

  const changeStatus = (id: number, status: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) }) }
    );
  };

  // Build a flat Set of currently-highlighted item IDs for quick lookup
  const highlightedItemIds = new Set<number>(
    [...newItemHighlights.entries()]
      .filter(([, exp]) => exp > Date.now())
      .map(([id]) => id)
  );

  // Split by order-level type — each order belongs to exactly ONE column
  const dineIn   = sortOrders(orders.filter(o => o.orderType === "dine_in"));
  const takeaway = sortOrders(orders.filter(o => o.orderType === "takeaway" || o.orderType === "delivery"));
  const mixed    = sortOrders(orders.filter(o => o.orderType === "mixed"));

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
              Active Orders:&nbsp;
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
        <div className={cn("grid grid-cols-1 min-h-[calc(100vh-72px)]", mixed.length > 0 ? "md:grid-cols-3" : "md:grid-cols-2")}>

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
                  highlightedItemIds={highlightedItemIds}
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onReady={() => changeStatus(order.id, "ready")}
                />
              ))
            )}
          </div>

          {/* ── Takeaway / Delivery ─────────────────────── */}
          <div className={cn("p-4 space-y-3", mixed.length > 0 && "border-r border-border")}>
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
                  highlightedItemIds={highlightedItemIds}
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onReady={() => changeStatus(order.id, "ready")}
                />
              ))
            )}
          </div>

          {/* ── Mixed Orders ─────────────────────────────── */}
          {mixed.length > 0 && (
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 pb-1">
                <Layers size={15} className="text-purple-400" />
                <h2 className="font-bold text-base text-foreground">Mixed</h2>
                <span className="ml-auto text-xs font-semibold bg-purple-500/15 text-purple-400 px-2.5 py-0.5 rounded-full border border-purple-500/25">
                  {mixed.length}
                </span>
              </div>
              {mixed.map(order => (
                <KitchenCard
                  key={order.id}
                  order={order}
                  highlightedItemIds={highlightedItemIds}
                  onPrepare={() => changeStatus(order.id, "preparing")}
                  onReady={() => changeStatus(order.id, "ready")}
                />
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}

const ORDER_TYPE_LABEL: Record<string, { label: string; icon: React.ReactNode }> = {
  dine_in:  { label: "Dine In",      icon: <UtensilsCrossed size={11} /> },
  takeaway: { label: "Takeaway",     icon: <ShoppingBag size={11} /> },
  delivery: { label: "Delivery",     icon: <ShoppingBag size={11} /> },
  mixed:    { label: "Mixed Order",  icon: <span className="flex items-center gap-0.5"><UtensilsCrossed size={10} /><ShoppingBag size={10} /></span> },
};

function ItemRow({
  item,
  highlightedItemIds,
}: {
  item: Order["items"][number];
  highlightedItemIds: Set<number>;
}) {
  const isNew = highlightedItemIds.has(item.id);
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg px-2 py-1 -mx-2 transition-colors",
        isNew && "bg-orange-500/12 border border-orange-500/25"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isNew && (
          <span className="flex items-center gap-0.5 text-[10px] font-black text-orange-400 bg-orange-500/20 px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wide">
            <Sparkles size={9} /> NEW
          </span>
        )}
        <span className={cn("text-base font-medium text-foreground leading-snug", isNew && "font-bold")}>
          {item.productName}
        </span>
      </div>
      <span className={cn("text-xl font-black w-8 text-right tabular-nums shrink-0", isNew ? "text-orange-400" : "text-primary")}>
        ×{item.quantity}
      </span>
    </div>
  );
}

function KitchenCard({
  order,
  highlightedItemIds,
  onPrepare,
  onReady,
}: {
  order: Order;
  highlightedItemIds: Set<number>;
  onPrepare: () => void;
  onReady: () => void;
}) {
  const meta = STATUS_META[order.status] ?? STATUS_META.approved;
  const orderTypeInfo = ORDER_TYPE_LABEL[order.orderType] ?? ORDER_TYPE_LABEL.dine_in;
  const isMixed = order.orderType === "mixed";

  const allItems     = order.items;
  const dineInItems  = isMixed ? allItems.filter(i => i.itemOrderType !== "takeaway") : allItems;
  const takeawayItems = isMixed ? allItems.filter(i => i.itemOrderType === "takeaway") : [];

  // Flag: this card has at least one newly-added item (drives "UPDATED" banner)
  const hasNewItems = allItems.some(i => highlightedItemIds.has(i.id));

  return (
    <div
      className={cn(
        "border rounded-2xl p-4 space-y-3 transition-all",
        meta.cardBorder,
        order.priority && "ring-2 ring-amber-500/40",
        hasNewItems && "ring-2 ring-orange-400/60 animate-pulse-once"
      )}
    >
      {/* Top row: badges + order number + elapsed */}
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
        {hasNewItems && (
          <span className="flex items-center gap-1 text-xs font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-2 py-0.5 rounded-full">
            <Sparkles size={11} /> UPDATED
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
          <span className="flex items-center gap-1">{orderTypeInfo.icon} {orderTypeInfo.label}</span>
        </p>
      </div>

      {/* Items — mixed orders get two segregated sections; others get a flat list */}
      {isMixed ? (
        <div className="space-y-3 border-t border-border/40 pt-3">
          {/* ── Dine In section ── */}
          {dineInItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <UtensilsCrossed size={11} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Dine In
                </span>
                <span className="ml-auto text-[10px] text-primary/50 font-semibold">
                  {dineInItems.length} item{dineInItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-0.5 pl-2 border-l-2 border-primary/30">
                {dineInItems.map(item => (
                  <ItemRow key={item.id} item={item} highlightedItemIds={highlightedItemIds} />
                ))}
              </div>
            </div>
          )}
          {/* ── Takeaway section ── */}
          {takeawayItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShoppingBag size={11} className="text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                  Takeaway
                </span>
                <span className="ml-auto text-[10px] text-blue-400/50 font-semibold">
                  {takeawayItems.length} item{takeawayItems.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div className="space-y-0.5 pl-2 border-l-2 border-blue-500/30">
                {takeawayItems.map(item => (
                  <ItemRow key={item.id} item={item} highlightedItemIds={highlightedItemIds} />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1 border-t border-border/40 pt-3">
          {dineInItems.map(item => (
            <ItemRow key={item.id} item={item} highlightedItemIds={highlightedItemIds} />
          ))}
        </div>
      )}

      {/* Notes */}
      {order.notes && (
        <div className="text-sm text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          📝 {order.notes}
        </div>
      )}

      {/* Action buttons */}
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
