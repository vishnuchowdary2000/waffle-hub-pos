import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListOrders,
  useUpdateOrder,
  useUpdateOrderStatus,
  useListCategories,
  useListProducts,
  useAddAddonItems,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import type { ListOrdersQueryResult, ListProductsQueryResult, ListCategoriesQueryResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Zap,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChefHat,
  Clock,
  RefreshCw,
  ClipboardList,
  AlertCircle,
  Pencil,
  Plus,
  Minus,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  X,
  CheckCircle,
} from "lucide-react";
import EditOrderModal from "./EditOrderModal";

const ACTIVE_STATUSES = "pending_payment,approved,preparing,ready";

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending_payment: {
    label: "Pending Payment",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
  },
  approved: {
    label: "Approved",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/30",
  },
  preparing: {
    label: "Preparing",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
  ready: {
    label: "Ready",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/30",
  },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in:  "Dine In",
  takeaway: "Takeaway",
  delivery: "Delivery",
  mixed:    "Mixed",
};

function elapsed(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
}

type QueueOrder = ListOrdersQueryResult[number];
type AddonProduct = ListProductsQueryResult[number];
type AddonCategory = ListCategoriesQueryResult[number];
type AddonItemType = "dine_in" | "takeaway";
type AddonCartItem = {
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: AddonItemType;
};

const ADDON_ORDER_TYPE_LABELS: Record<string, string> = { dine_in: "Dine In", takeaway: "Takeaway" };

export default function Queue() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [addonOrderId, setAddonOrderId] = useState<number | null>(null);

  const { data: orders = [], isLoading, dataUpdatedAt } = useListOrders(
    { status: ACTIVE_STATUSES },
    {
      query: {
        queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }),
        refetchInterval: 5000,
      },
    }
  );

  const updateOrder = useUpdateOrder();
  const updateStatus = useUpdateOrderStatus();

  const { data: allCategories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });

  const STATUS_RANK: Record<string, number> = { preparing: 0, approved: 1, pending_payment: 2, ready: 3 };
  const sorted = [...orders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  const invalidate = () => {
    // Invalidate ALL orders queries (Queue + Kitchen) so every view updates immediately.
    void qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
  };

  const setBusy = (id: number, busy: boolean) => {
    setBusyIds(prev => {
      const s = new Set(prev);
      busy ? s.add(id) : s.delete(id);
      return s;
    });
  };

  const togglePriority = (order: (typeof orders)[0]) => {
    setBusy(order.id, true);
    updateOrder.mutate(
      { id: order.id, data: { priority: !order.priority } },
      { onSettled: () => { setBusy(order.id, false); invalidate(); } }
    );
  };

  const approve = (id: number) => {
    setBusy(id, true);
    updateStatus.mutate(
      { id, data: { status: "approved" } },
      { onSettled: () => { setBusy(id, false); invalidate(); } }
    );
  };

  const complete = (id: number) => {
    setBusy(id, true);
    updateStatus.mutate(
      { id, data: { status: "completed" } },
      { onSettled: () => { setBusy(id, false); invalidate(); } }
    );
  };

  const cancel = (id: number) => {
    setBusy(id, true);
    setConfirmCancel(null);
    updateStatus.mutate(
      { id, data: { status: "cancelled" } },
      { onSettled: () => { setBusy(id, false); invalidate(); } }
    );
  };

  const lastUpdated = new Date(dataUpdatedAt).toLocaleTimeString();

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <ClipboardList size={16} className="text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Order Queue</h1>
              <p className="text-xs text-muted-foreground">
                {sorted.length} active · updated {lastUpdated}
              </p>
            </div>
          </div>

          {/* Status summary pills */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(STATUS_META).map(([key, meta]) => {
              const count = orders.filter(o => o.status === key).length;
              if (count === 0) return null;
              return (
                <span
                  key={key}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold",
                    meta.bg,
                    meta.color
                  )}
                >
                  {meta.label}: {count}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Order list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="animate-spin text-primary" size={28} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <ClipboardList size={48} className="mb-3 opacity-30" />
            <p className="text-lg font-medium">No active orders</p>
            <p className="text-sm mt-1">All caught up!</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl mx-auto">
            {sorted.map(order => {
              const meta = STATUS_META[order.status] ?? STATUS_META.approved;
              const isBusy = busyIds.has(order.id);
              const isUnpaid =
                order.status === "pending_payment" ||
                (order.payment && order.payment.status !== "paid");

              return (
                <div
                  key={order.id}
                  className={cn(
                    "relative bg-card border rounded-2xl overflow-hidden transition-all",
                    order.priority
                      ? "border-amber-500/50 shadow-amber-500/10 shadow-lg"
                      : "border-card-border"
                  )}
                >
                  {/* Card header */}
                  <div className="px-4 pt-4 pb-3 flex items-start gap-3">
                    {/* Priority indicator */}
                    <div className="flex flex-col items-center gap-1 shrink-0">
                      <button
                        onClick={() => togglePriority(order)}
                        disabled={isBusy}
                        title={order.priority ? "Remove priority" : "Mark as priority"}
                        className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                          order.priority
                            ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                            : "bg-secondary text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10"
                        )}
                      >
                        <Zap size={15} fill={order.priority ? "currentColor" : "none"} />
                      </button>
                    </div>

                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">
                          {order.orderNumber}
                        </span>
                        {order.priority && (
                          <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold border border-amber-500/30">
                            PRIORITY
                          </span>
                        )}
                        <span
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-semibold border",
                            meta.bg,
                            meta.color
                          )}
                        >
                          {meta.label}
                        </span>
                        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                          {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-sm font-medium text-foreground">
                          {order.customerName}
                        </span>
                        {order.customerPhone && (
                          <span className="text-xs text-muted-foreground">
                            {order.customerPhone}
                          </span>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock size={11} />
                          {elapsed(order.createdAt)}
                        </span>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-primary">{formatCurrency(order.totalAmount)}</p>
                      {isUnpaid && order.status !== "pending_payment" && (
                        <span className="text-xs text-amber-400 font-medium">Unpaid</span>
                      )}
                    </div>
                  </div>

                  {/* Items */}
                  <div className="px-4 pb-3">
                    <div className="flex flex-wrap gap-1.5">
                      {order.items.map(item => (
                        <span
                          key={item.id}
                          className="text-xs bg-secondary text-foreground px-2.5 py-1 rounded-lg"
                        >
                          {item.quantity > 1 && (
                            <span className="text-primary font-bold mr-1">×{item.quantity}</span>
                          )}
                          {item.productName}
                        </span>
                      ))}
                      {order.notes && (
                        <span className="text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20">
                          📝 {order.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="px-4 pb-4 flex gap-2 flex-wrap border-t border-border/50 pt-3">
                    {/* Send to Kitchen (pending_payment only) */}
                    {order.status === "pending_payment" && (
                      <button
                        onClick={() => approve(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-violet-500/15 hover:bg-violet-500/25 text-violet-400 border border-violet-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <ChefHat size={13} />
                        Send to Kitchen
                      </button>
                    )}

                    {/* Collect Payment */}
                    {(order.status === "pending_payment" || order.payment?.status !== "paid") && (
                      <button
                        onClick={() => navigate(`/billing/${order.id}`)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <CreditCard size={13} />
                        {order.status === "pending_payment" ? "Pay & Send" : "Collect Payment"}
                      </button>
                    )}

                    {/* Edit Order — full edit only for pending_payment (not yet in kitchen) */}
                    {order.status === "pending_payment" && (
                      <button
                        onClick={() => setEditOrderId(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    )}

                    {/* Add Items — kitchen orders: only new items sent to kitchen */}
                    {["approved", "preparing", "ready"].includes(order.status) && (
                      <button
                        onClick={() => setAddonOrderId(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Plus size={13} />
                        Add Items
                      </button>
                    )}

                    {/* Mark Complete (ready orders) */}
                    {order.status === "ready" && (
                      <button
                        onClick={() => complete(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <CheckCircle2 size={13} />
                        Mark Complete
                      </button>
                    )}

                    {/* Cancel */}
                    <button
                      onClick={() => setConfirmCancel(order.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-2 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ml-auto"
                    >
                      <XCircle size={13} />
                      Cancel
                    </button>
                  </div>

                  {isBusy && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-2xl">
                      <RefreshCw className="animate-spin text-primary" size={20} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Order modal — full edit for pending_payment orders */}
      {editOrderId !== null && (() => {
        const editOrder = orders.find(o => o.id === editOrderId);
        return editOrder ? (
          <EditOrderModal
            order={editOrder}
            onClose={() => setEditOrderId(null)}
          />
        ) : null;
      })()}

      {/* Add Items modal — kitchen orders: only new items sent to kitchen */}
      {addonOrderId !== null && (() => {
        const addonOrder = orders.find(o => o.id === addonOrderId);
        return addonOrder ? (
          <AddItemsModal
            order={addonOrder}
            categories={allCategories}
            allProducts={allProducts}
            onClose={() => setAddonOrderId(null)}
            onSuccess={() => {
              setAddonOrderId(null);
              void qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
            }}
          />
        ) : null;
      })()}

      {/* Cancel confirm modal */}
      {confirmCancel !== null && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertCircle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Cancel this order?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Order {orders.find(o => o.id === confirmCancel)?.orderNumber} will be cancelled. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setConfirmCancel(null)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Keep Order
              </button>
              <button
                onClick={() => cancel(confirmCancel)}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold hover:opacity-90 transition-all"
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AddItemsModal({
  order,
  categories,
  allProducts,
  onClose,
  onSuccess,
}: {
  order: QueueOrder;
  categories: AddonCategory[];
  allProducts: AddonProduct[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [addonCart, setAddonCart] = useState<AddonCartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<AddonItemType>(
    order.orderType === "takeaway" ? "takeaway" : "dine_in"
  );
  const [done, setDone] = useState(false);
  const addAddonItems = useAddAddonItems();

  const addToCart = (p: AddonProduct) => {
    setAddonCart(prev => {
      const existing = prev.find(c => c.productId === p.id && c.itemOrderType === orderType);
      if (existing)
        return prev.map(c =>
          c.productId === p.id && c.itemOrderType === orderType ? { ...c, quantity: c.quantity + 1 } : c
        );
      return [
        ...prev,
        { productId: p.id, productName: p.name, price: Number(p.price), quantity: 1, itemOrderType: orderType },
      ];
    });
  };

  const removeFromCart = (productId: number | null, iot: string) => {
    setAddonCart(prev => prev.filter(c => !(c.productId === productId && c.itemOrderType === iot)));
  };

  const cartTotal = addonCart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = addonCart.reduce((s, c) => s + c.quantity, 0);

  const filteredProducts = allProducts.filter(p => {
    const matchesCat = !activeCategory || p.categoryId === activeCategory;
    const catActive =
      p.categoryId == null || categories.some(c => c.id === p.categoryId && c.active);
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && catActive && matchesSearch && p.active !== false;
  });

  const handleSubmit = () => {
    if (addonCart.length === 0) return;
    addAddonItems.mutate(
      {
        id: order.id,
        data: {
          items: addonCart.map(c => ({
            productId: c.productId,
            productName: c.productName,
            price: c.price,
            quantity: c.quantity,
            itemOrderType: c.itemOrderType,
          })),
        },
      },
      {
        onSuccess: () => {
          setDone(true);
          setTimeout(onSuccess, 1200);
        },
      }
    );
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-xl font-bold text-foreground">Sent to Kitchen!</p>
          <p className="text-muted-foreground text-sm mt-1">
            {order.orderNumber} — add-on items queued
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div
        className="bg-card border border-card-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-orange-400 bg-orange-500/15 border border-orange-400/30 px-2 py-0.5 rounded-full">
                  ＋ ADD-ON
                </span>
                <span className="text-xs font-mono text-muted-foreground">{order.orderNumber}</span>
              </div>
              <h2 className="text-base font-bold text-foreground">{order.customerName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current total:{" "}
                <span className="text-primary font-bold">{formatCurrency(order.totalAmount)}</span>
                {cartTotal > 0 && (
                  <span className="text-foreground">
                    {" "}→ {formatCurrency(order.totalAmount + cartTotal)}
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1"
            >
              <X size={18} />
            </button>
          </div>
          {/* Order type tabs */}
          <div className="flex gap-2 mt-3">
            {(["dine_in", "takeaway"] as AddonItemType[]).map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  orderType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                )}
              >
                {ADDON_ORDER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Body: product grid + cart */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: product picker */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="px-4 pt-3 pb-2 shrink-0 space-y-2">
              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button
                  onClick={() => setActiveCategory(null)}
                  className={cn(
                    "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    !activeCategory
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  All
                </button>
                {categories
                  .filter(c => c.active)
                  .map(c => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCategory(c.id)}
                      className={cn(
                        "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                        activeCategory === c.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredProducts.map(p => {
                  const inCart = addonCart.find(
                    c => c.productId === p.id && c.itemOrderType === orderType
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className={cn(
                        "relative rounded-xl p-3 text-left border transition-all active:scale-95",
                        inCart
                          ? "bg-primary/15 border-primary/50"
                          : "bg-secondary border-transparent hover:border-primary/30"
                      )}
                    >
                      {inCart && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground text-xs font-bold">
                            {inCart.quantity}
                          </span>
                        </div>
                      )}
                      <p className="font-semibold text-sm text-foreground leading-tight">{p.name}</p>
                      <p className="text-primary font-bold text-sm mt-1">
                        {formatCurrency(Number(p.price))}
                      </p>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="col-span-3 text-center text-sm text-muted-foreground py-8">
                    No products found
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right: addon cart */}
          <div className="w-52 border-l border-border flex flex-col shrink-0 overflow-hidden">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-2 shrink-0">
              New Items
            </p>
            <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-2">
              {addonCart.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Tap items to add</p>
              ) : (
                addonCart.map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground leading-tight">
                        {c.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ×{c.quantity} · {formatCurrency(c.price * c.quantity)}
                      </p>
                    </div>
                    <button
                      onClick={() => removeFromCart(c.productId, c.itemOrderType)}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>
            {addonCart.length > 0 && (
              <div className="px-4 pb-3 border-t border-border pt-2 shrink-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Add-on</span>
                  <span className="font-bold text-primary">{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">New total</span>
                  <span className="font-bold text-foreground">
                    {formatCurrency(order.totalAmount + cartTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <button
            onClick={handleSubmit}
            disabled={addonCart.length === 0 || addAddonItems.isPending}
            className="w-full py-3 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {addAddonItems.isPending
              ? "Sending to Kitchen..."
              : cartCount > 0
              ? `Send ${cartCount} Item${cartCount !== 1 ? "s" : ""} to Kitchen →`
              : "Select items to add"}
          </button>
        </div>
      </div>
    </div>
  );
}
