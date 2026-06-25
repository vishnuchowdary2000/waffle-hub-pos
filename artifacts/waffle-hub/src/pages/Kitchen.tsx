import {
  useListOrders,
  useListProducts,
  useUpdateOrderStatus,
  useUpdateSubOrderStatus,
  getListOrdersQueryKey,
  type ListOrdersQueryResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { playNotificationSound } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Clock, RefreshCw, ChefHat, ShoppingBag,
  UtensilsCrossed, Zap, Sparkles, ClipboardList,
} from "lucide-react";

const ACTIVE_STATUSES = "approved,preparing,ready";
const NEW_ITEM_TTL_MS = 45_000;

type Order = ListOrdersQueryResult[number];
type SubOrder = NonNullable<Order["subOrders"]>[number];

const STATUS_META: Record<string, { label: string; cardBorder: string; badge: string }> = {
  approved:  { label: "New",       cardBorder: "border-violet-500/50 bg-violet-500/5", badge: "bg-violet-500/20 text-violet-300 border-violet-500/30" },
  preparing: { label: "Preparing", cardBorder: "border-blue-500/50 bg-blue-500/5",     badge: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  ready:     { label: "Ready ✓",   cardBorder: "border-green-500/50 bg-green-500/5",   badge: "bg-green-500/20 text-green-300 border-green-500/30" },
};

const SUB_CODE_META: Record<string, { bg: string; text: string }> = {
  A: { bg: "bg-primary/20 border-primary/40",        text: "text-primary" },
  B: { bg: "bg-blue-500/20 border-blue-500/40",      text: "text-blue-300" },
  C: { bg: "bg-purple-500/20 border-purple-500/40",  text: "text-purple-300" },
};

function elapsed(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Sorting: preparing first → approved → ready → by createdAt
const STATUS_RANK: Record<string, number> = { preparing: 0, approved: 1, ready: 2 };

type KitchenItem =
  | { kind: "order"; order: Order }
  | { kind: "sub"; order: Order; subOrder: SubOrder };

function sortColumn(items: KitchenItem[]): KitchenItem[] {
  return [...items].sort((a, b) => {
    const aStatus = a.kind === "sub" ? a.subOrder.status : a.order.status;
    const bStatus = b.kind === "sub" ? b.subOrder.status : b.order.status;
    const ra = STATUS_RANK[aStatus] ?? 99;
    const rb = STATUS_RANK[bStatus] ?? 99;
    if (ra !== rb) return ra - rb;
    if (a.order.priority !== b.order.priority) return a.order.priority ? -1 : 1;
    return new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime();
  });
}

function buildColumns(orders: Order[]): { dineIn: KitchenItem[]; takeaway: KitchenItem[] } {
  const dineIn: KitchenItem[] = [];
  const takeaway: KitchenItem[] = [];
  for (const order of orders) {
    const subs = order.subOrders ?? [];
    if (subs.length >= 2) {
      for (const sub of subs) {
        const item: KitchenItem = { kind: "sub", order, subOrder: sub };
        (sub.orderType === "dine_in" ? dineIn : takeaway).push(item);
      }
    } else {
      const item: KitchenItem = { kind: "order", order };
      (order.orderType === "dine_in" ? dineIn : takeaway).push(item);
    }
  }
  return { dineIn: sortColumn(dineIn), takeaway: sortColumn(takeaway) };
}

export default function Kitchen() {
  const qc = useQueryClient();

  const prevOrderIds = useRef<Set<number>>(new Set());
  const orderItemSnapshot = useRef<Map<number, Set<number>>>(new Map());
  const [newItemHighlights, setNewItemHighlights] = useState<Map<number, number>>(new Map());
  const [tick, setTick] = useState(0);

  const { data: orders = [], isLoading } = useListOrders(
    { status: ACTIVE_STATUSES },
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) } }
  );
  const { data: products = [] } = useListProducts({ active: true });

  const updateStatus = useUpdateOrderStatus();
  const updateSubStatus = useUpdateSubOrderStatus();

  // Detect new orders and new items within existing orders
  useEffect(() => {
    const now = Date.now();
    const currentOrderIds = new Set(orders.map(o => o.id));

    const hasNewOrder = orders.some(o => !prevOrderIds.current.has(o.id));
    if (prevOrderIds.current.size > 0 && hasNewOrder) {
      playNotificationSound();
    }
    prevOrderIds.current = currentOrderIds;

    const addedItemIds: number[] = [];
    for (const order of orders) {
      const knownItems = orderItemSnapshot.current.get(order.id);
      const currentItemIds = new Set(order.items.map(i => i.id));
      if (!knownItems) {
        orderItemSnapshot.current.set(order.id, currentItemIds);
      } else {
        for (const itemId of currentItemIds) {
          if (!knownItems.has(itemId)) addedItemIds.push(itemId);
        }
        orderItemSnapshot.current.set(order.id, currentItemIds);
      }
    }
    for (const orderId of orderItemSnapshot.current.keys()) {
      if (!currentOrderIds.has(orderId)) orderItemSnapshot.current.delete(orderId);
    }
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

  useEffect(() => {
    const t = setInterval(() => {
      setNewItemHighlights(prev => {
        const now = Date.now();
        if ([...prev.values()].every(exp => exp > now)) return prev;
        return new Map([...prev].filter(([, exp]) => exp > now));
      });
      setTick(x => x + 1);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  void tick;

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }) });

  const changeStatus = (id: number, status: string) =>
    updateStatus.mutate({ id, data: { status } }, { onSuccess: invalidate });

  const changeSubStatus = (subId: number, status: string) =>
    updateSubStatus.mutate({ id: subId, data: { status } }, { onSuccess: invalidate });

  const highlightedItemIds = new Set<number>(
    [...newItemHighlights.entries()]
      .filter(([, exp]) => exp > Date.now())
      .map(([id]) => id)
  );

  // productId → categoryName, and UPPER(productName) → categoryName (fallback)
  const productCategoryMap = useMemo(() => {
    const byId = new Map<number, string>();
    const byName = new Map<string, string>(); // UPPER(name) → categoryName
    for (const p of products) {
      if (p.id != null && p.categoryName) {
        byId.set(p.id, p.categoryName);
        byName.set(p.name.toUpperCase(), p.categoryName);
      }
    }
    return { byId, byName };
  }, [products]);

  // Pending summary: sum item quantities from approved-only cards, grouped by category
  const pendingSummary = useMemo(() => {
    const getCat = (item: { productId?: number | null; productName: string }) => {
      if (item.productId != null) return productCategoryMap.byId.get(item.productId);
      return productCategoryMap.byName.get(item.productName.toUpperCase());
    };

    const counts = new Map<string, number>();
    for (const order of orders) {
      const subs = order.subOrders ?? [];
      if (subs.length >= 2) {
        // Split order — count per sub-order that is still pending
        for (const sub of subs) {
          if (sub.status !== "approved") continue;
          for (const item of order.items) {
            if (item.itemOrderType !== sub.orderType) continue;
            const cat = getCat(item);
            if (!cat) continue;
            counts.set(cat, (counts.get(cat) ?? 0) + item.quantity);
          }
        }
      } else {
        // Regular order — count if still pending
        if (order.status !== "approved") continue;
        for (const item of order.items) {
          const cat = getCat(item);
          if (!cat) continue;
          counts.set(cat, (counts.get(cat) ?? 0) + item.quantity);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [orders, productCategoryMap]);

  const { dineIn, takeaway } = buildColumns(orders);
  const activeCount = new Set(orders.map(o => o.id)).size;
  const totalCards = dineIn.length + takeaway.length;

  const renderCard = (item: KitchenItem) =>
    item.kind === "sub" ? (
      <KitchenCard
        key={`sub-${item.subOrder.id}`}
        order={item.order}
        highlightedItemIds={highlightedItemIds}
        subOrder={item.subOrder}
        subItems={item.order.items.filter(i => i.itemOrderType === item.subOrder.orderType)}
        onPrepare={() => changeSubStatus(item.subOrder.id, "preparing")}
        onReady={() => changeSubStatus(item.subOrder.id, "ready")}
      />
    ) : (
      <KitchenCard
        key={`order-${item.order.id}`}
        order={item.order}
        highlightedItemIds={highlightedItemIds}
        onPrepare={() => changeStatus(item.order.id, "preparing")}
        onReady={() => changeStatus(item.order.id, "ready")}
      />
    );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <ChefHat size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground leading-tight">Kitchen Display</h1>
            <p className="text-xs text-muted-foreground">
              <span className="font-bold text-foreground">{activeCount}</span> active order{activeCount !== 1 ? "s" : ""}
              {totalCards > activeCount && (
                <span className="text-primary/70"> · {totalCards} cards</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Live
        </div>
      </div>

      {/* ── Production Summary strip ──────────────────────── */}
      <div className="sticky top-[57px] z-20 bg-background/98 backdrop-blur border-b border-amber-500/25 px-4 py-2 flex items-center gap-3 overflow-x-auto shrink-0">
        <div className="flex items-center gap-1.5 shrink-0">
          <ClipboardList size={13} className="text-amber-400" />
          <span className="text-xs font-black uppercase tracking-widest text-amber-400">Pending</span>
        </div>
        <div className="w-px h-4 bg-border/60 shrink-0" />
        {pendingSummary.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">All clear — nothing pending</span>
        ) : (
          <div className="flex items-center gap-2">
            {pendingSummary.map(([cat, qty]) => (
              <div
                key={cat}
                className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 rounded-full px-3 py-0.5 shrink-0"
              >
                <span className="text-xs font-medium text-amber-200/80">{cat}</span>
                <span className="text-sm font-black text-amber-400 leading-none">{qty}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <RefreshCw className="animate-spin text-primary" size={28} />
        </div>
      ) : totalCards === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <Clock size={48} className="mb-4 opacity-30" />
          <p className="text-lg font-medium">No active orders</p>
          <p className="text-sm">Waiting for new orders…</p>
        </div>
      ) : (
        /* Two-column layout */
        <div className="flex flex-1 divide-x divide-border/60">

          {/* ── Dine In column ─────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Column header */}
            <div className="sticky top-[97px] z-10 bg-background/95 backdrop-blur px-4 py-2.5 border-b border-primary/20 flex items-center gap-2">
              <UtensilsCrossed size={13} className="text-primary shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest text-primary">Dine In</span>
              <span className="ml-auto text-xs font-semibold text-primary/60 bg-primary/10 px-2 py-0.5 rounded-full">
                {dineIn.length}
              </span>
            </div>
            {/* Cards */}
            <div className="p-3 space-y-3 flex-1">
              {dineIn.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
                  <UtensilsCrossed size={32} className="mb-2" />
                  <p className="text-xs">No dine in orders</p>
                </div>
              ) : (
                dineIn.map(renderCard)
              )}
            </div>
          </div>

          {/* ── Takeaway column ────────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Column header */}
            <div className="sticky top-[97px] z-10 bg-background/95 backdrop-blur px-4 py-2.5 border-b border-blue-500/20 flex items-center gap-2">
              <ShoppingBag size={13} className="text-blue-400 shrink-0" />
              <span className="text-xs font-black uppercase tracking-widest text-blue-400">Takeaway</span>
              <span className="ml-auto text-xs font-semibold text-blue-400/60 bg-blue-500/10 px-2 py-0.5 rounded-full">
                {takeaway.length}
              </span>
            </div>
            {/* Cards */}
            <div className="p-3 space-y-3 flex-1">
              {takeaway.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/40">
                  <ShoppingBag size={32} className="mb-2" />
                  <p className="text-xs">No takeaway orders</p>
                </div>
              ) : (
                takeaway.map(renderCard)
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

const ORDER_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  dine_in:  { label: "🍽️ Dine In",  className: "bg-primary/15 text-primary border-primary/25" },
  takeaway: { label: "📦 Takeaway", className: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  delivery: { label: "🛵 Delivery", className: "bg-blue-500/15 text-blue-300 border-blue-500/25" },
  mixed:    { label: "🍽️📦 Mixed",  className: "bg-purple-500/15 text-purple-300 border-purple-500/25" },
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
  subOrder,
  subItems,
}: {
  order: Order;
  highlightedItemIds: Set<number>;
  onPrepare: () => void;
  onReady: () => void;
  subOrder?: SubOrder;
  subItems?: Order["items"];
}) {
  // Sub-order mode: use subOrder's status/type; regular mode: use order's
  const isSubMode = !!subOrder;
  const displayStatus = isSubMode ? subOrder!.status : order.status;
  const displayType   = isSubMode ? subOrder!.orderType : order.orderType;
  const displayItems  = isSubMode ? (subItems ?? []) : order.items;
  const displayNumber = isSubMode
    ? `${order.orderNumber}${subOrder!.subCode}`
    : order.orderNumber;

  const meta = STATUS_META[displayStatus] ?? STATUS_META.approved;

  // In sub-order mode, items are pre-filtered — never show mixed layout
  const isMixed =
    !isSubMode && (
      order.orderType === "mixed" ||
      (order.items.some(i => i.itemOrderType === "dine_in") &&
       order.items.some(i => i.itemOrderType === "takeaway"))
    );

  const typeBadge = ORDER_TYPE_BADGE[isMixed ? "mixed" : displayType] ?? ORDER_TYPE_BADGE.dine_in;
  const subCodeMeta = subOrder ? (SUB_CODE_META[subOrder.subCode] ?? SUB_CODE_META.A) : null;

  const allItems   = order.items;
  const dineInItems   = isMixed ? allItems.filter(i => i.itemOrderType !== "takeaway") : [];
  const takeawayItems = isMixed ? allItems.filter(i => i.itemOrderType === "takeaway") : [];

  const hasNewItems = displayItems.some(i => highlightedItemIds.has(i.id));

  return (
    <div
      className={cn(
        "border rounded-2xl p-4 space-y-3 transition-all",
        meta.cardBorder,
        order.priority && "ring-2 ring-amber-500/40",
        hasNewItems && "ring-2 ring-orange-400/60",
        isSubMode && "border-l-4"
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-2 flex-wrap">
        {order.priority && (
          <span className="flex items-center gap-1 text-xs font-bold text-amber-400 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-full">
            <Zap size={11} fill="currentColor" /> PRIORITY
          </span>
        )}
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", meta.badge)}>
          {meta.label}
        </span>
        <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", typeBadge.className)}>
          {typeBadge.label}
        </span>
        {/* Sub-order letter badge */}
        {subCodeMeta && (
          <span className={cn(
            "text-xs font-black px-2 py-0.5 rounded-full border",
            subCodeMeta.bg, subCodeMeta.text
          )}>
            Part {subOrder!.subCode}
          </span>
        )}
        <span className="font-mono text-xs text-muted-foreground">{displayNumber}</span>
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

      {/* Customer name + phone + payment status */}
      <div className="space-y-1">
        <p className="text-2xl font-black text-foreground leading-tight tracking-tight">
          {order.customerName}
        </p>
        {order.customerPhone && (
          <p className="text-xs text-muted-foreground font-medium">📱 {order.customerPhone}</p>
        )}
        <div>
          {order.payment && order.payment.balance <= 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-full">
              🟢 Paid
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 border border-red-500/30 px-2 py-0.5 rounded-full">
              🔴 Unpaid
            </span>
          )}
        </div>
      </div>

      {/* Items */}
      {isSubMode ? (
        // Sub-order mode: flat filtered list
        <div className="space-y-1 border-t border-border/40 pt-3">
          {displayItems.map(item => (
            <ItemRow key={item.id} item={item} highlightedItemIds={highlightedItemIds} />
          ))}
        </div>
      ) : isMixed ? (
        // Legacy mixed mode (order has no sub-orders yet — e.g. pending_payment)
        <div className="space-y-3 border-t border-border/40 pt-3">
          {dineInItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <UtensilsCrossed size={11} className="text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Dine In</span>
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
          {takeawayItems.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <ShoppingBag size={11} className="text-blue-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Takeaway</span>
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
        // Regular order: flat list
        <div className="space-y-1 border-t border-border/40 pt-3">
          {displayItems.map(item => (
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
        {displayStatus === "approved" && (
          <button
            onClick={onPrepare}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Start Preparing
          </button>
        )}
        {displayStatus === "preparing" && (
          <button
            onClick={onReady}
            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Mark Ready
          </button>
        )}
        {displayStatus === "ready" && (
          <div className="w-full py-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm font-bold text-green-400 text-center">
            ✓ Ready — awaiting handover
          </div>
        )}
      </div>
    </div>
  );
}
