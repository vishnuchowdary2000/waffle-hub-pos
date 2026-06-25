import { useParams } from "wouter";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useTrackPublicOrder, getTrackPublicOrderQueryKey,
  useGetPublicStoreStatus, getGetPublicStoreStatusQueryKey,
  useCancelPublicOrder, useAddPublicOrderItems,
  useGetPublicMenu,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  ChefHat, Clock, CheckCircle2, RefreshCw,
  UtensilsCrossed, ShoppingBag, Zap, AlertCircle, Phone, MapPin,
  X, Plus, Minus, ShoppingCart, PackagePlus, Timer, Ban,
} from "lucide-react";

const STATUSES = [
  { key: "pending_payment", label: "Pending Payment",  icon: Clock,          color: "text-amber-400",  bg: "bg-amber-500/20 border-amber-500/40" },
  { key: "approved",        label: "Approved",          icon: CheckCircle2,   color: "text-violet-400", bg: "bg-violet-500/20 border-violet-500/40" },
  { key: "preparing",       label: "Preparing",         icon: ChefHat,        color: "text-blue-400",   bg: "bg-blue-500/20 border-blue-500/40" },
  { key: "ready",           label: "Ready! 🎉",         icon: CheckCircle2,   color: "text-green-400",  bg: "bg-green-500/20 border-green-500/40" },
  { key: "completed",       label: "Completed ✓",       icon: CheckCircle2,   color: "text-green-500",  bg: "bg-green-600/20 border-green-600/40" },
];

const CANCELLED_STATUS = { key: "cancelled", label: "Cancelled", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/20 border-destructive/40" };
const ADD_BLOCKED = ["preparing", "ready", "completed", "cancelled"];

function statusIndex(status: string) {
  const idx = STATUSES.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

function fmtTime(secs: number) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

interface MiniCartItem {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: "dine_in" | "takeaway";
}

export default function CustomerTrack() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber ?? "";
  const qc = useQueryClient();

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addCart, setAddCart] = useState<MiniCartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [addItemType] = useState<"dine_in" | "takeaway">("dine_in");
  const [addSuccess, setAddSuccess] = useState("");

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: order, isLoading, isError } = useTrackPublicOrder(
    orderNumber,
    { query: { queryKey: getTrackPublicOrderQueryKey(orderNumber), refetchInterval: 5000 } }
  );

  const { data: storeStatus } = useGetPublicStoreStatus({
    query: { queryKey: getGetPublicStoreStatusQueryKey() },
  });
  const contactNumber = storeStatus?.contactNumber ?? "";

  const { data: menu = [] } = useGetPublicMenu();

  const cancelMutation = useCancelPublicOrder();
  const addItemsMutation = useAddPublicOrderItems();

  const isCancelled = order?.status === "cancelled";
  const currentIdx = order ? statusIndex(order.status) : 0;
  const currentStatus = isCancelled ? CANCELLED_STATUS : (STATUSES[currentIdx] ?? STATUSES[0]);

  // Countdown derived state
  const orderCreatedMs = order ? new Date(order.createdAt).getTime() : 0;
  const elapsedSecs = orderCreatedMs ? Math.floor((nowMs - orderCreatedMs) / 1000) : 0;
  const cancelSecsLeft = (order?.status === "pending_payment")
    ? Math.max(0, 120 - elapsedSecs) : 0;
  const addSecsLeft = (order && !ADD_BLOCKED.includes(order.status))
    ? Math.max(0, 300 - elapsedSecs) : 0;

  // Mini-cart operations
  const addMiniItem = (productId: number, productName: string, price: number) => {
    setAddCart(prev => {
      const idx = prev.findIndex(c => c.productId === productId);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId, productName, price, quantity: 1, itemOrderType: addItemType }];
    });
  };
  const removeMiniItem = (productId: number) => {
    setAddCart(prev => {
      const idx = prev.findIndex(c => c.productId === productId);
      if (idx < 0) return prev;
      const item = prev[idx];
      if (item.quantity === 1) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };
  const miniQty = (productId: number) => addCart.find(c => c.productId === productId)?.quantity ?? 0;
  const miniTotal = addCart.reduce((s, c) => s + c.price * c.quantity, 0);

  const handleAddItems = () => {
    if (addCart.length === 0) return;
    addItemsMutation.mutate(
      {
        orderNumber,
        data: {
          items: addCart.map(c => ({
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
          qc.invalidateQueries({ queryKey: getTrackPublicOrderQueryKey(orderNumber) });
          setShowAddPanel(false);
          setAddCart([]);
          setAddSuccess("Items added to your order!");
          setTimeout(() => setAddSuccess(""), 4000);
        },
      }
    );
  };

  const handleCancel = () => {
    if (!window.confirm("Are you sure you want to cancel this order?")) return;
    cancelMutation.mutate(
      { orderNumber },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getTrackPublicOrderQueryKey(orderNumber) });
        },
      }
    );
  };

  useEffect(() => {
    if (menu.length > 0 && activeCategory === null) {
      setActiveCategory(menu[0].id);
    }
  }, [menu, activeCategory]);

  const activeCat = menu.find(c => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <ChefHat size={18} className="text-primary" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm leading-tight">The Waffle Hub</p>
            <p className="text-xs text-muted-foreground">Order Tracking</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Live
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <RefreshCw className="animate-spin text-primary" size={28} />
            <p className="text-muted-foreground text-sm">Loading your order…</p>
          </div>
        )}

        {isError && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <AlertCircle size={40} className="text-destructive/60" />
            <p className="font-medium">Order not found</p>
            <p className="text-sm text-center">
              We couldn't find order <span className="font-mono">{orderNumber}</span>.
              Please check the order number or ask at the counter.
            </p>
          </div>
        )}

        {order && (
          <>
            {/* Order summary card */}
            <div className={cn("border rounded-2xl px-5 py-4 space-y-3", currentStatus.bg)}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
                  <p className="text-2xl font-black text-foreground mt-0.5">{order.customerName}</p>
                </div>
                <div className={cn("flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-xl border", currentStatus.color, currentStatus.bg)}>
                  <currentStatus.icon size={14} />
                  {currentStatus.label}
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {order.orderType === "dine_in"
                  ? <span className="flex items-center gap-1.5"><UtensilsCrossed size={13} /> Dine In</span>
                  : <span className="flex items-center gap-1.5"><ShoppingBag size={13} /> Takeaway</span>}
                <span>·</span>
                <span className="font-bold text-foreground">₹{order.totalAmount}</span>
                <span>·</span>
                <span>{order.items.reduce((s, i) => s + i.quantity, 0)} item{order.items.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* ── Cancellation Window ───────────────────────────────────────── */}
            {order.status === "pending_payment" && (
              <div className={cn(
                "border rounded-2xl px-4 py-4 space-y-3",
                cancelSecsLeft > 0
                  ? "bg-destructive/8 border-destructive/30"
                  : "bg-secondary/50 border-border"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Timer size={15} className={cancelSecsLeft > 0 ? "text-destructive" : "text-muted-foreground"} />
                    <span className={cn("text-sm font-semibold", cancelSecsLeft > 0 ? "text-destructive" : "text-muted-foreground")}>
                      Order Cancellation
                    </span>
                  </div>
                  {cancelSecsLeft > 0 ? (
                    <span className="font-mono text-lg font-black text-destructive tabular-nums">
                      {fmtTime(cancelSecsLeft)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Window expired</span>
                  )}
                </div>
                {cancelSecsLeft > 0 ? (
                  <button
                    onClick={handleCancel}
                    disabled={cancelMutation.isPending}
                    className="w-full py-2.5 bg-destructive/15 border border-destructive/40 text-destructive rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-destructive/25 transition-colors disabled:opacity-50"
                  >
                    {cancelMutation.isPending
                      ? <><RefreshCw size={14} className="animate-spin" /> Cancelling…</>
                      : <><X size={14} /> Cancel This Order</>}
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">
                    Cancellation window has expired. Please speak to a staff member if you need help.
                  </p>
                )}
              </div>
            )}

            {/* ── Add Items Window ──────────────────────────────────────────── */}
            {addSecsLeft > 0 && (
              <div className="border border-amber-500/25 rounded-2xl bg-amber-500/5 overflow-hidden">
                <button
                  onClick={() => setShowAddPanel(v => !v)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-amber-500/8 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <PackagePlus size={15} className="text-amber-400" />
                    <span className="text-sm font-semibold text-amber-300">Add More Items</span>
                    {addCart.length > 0 && (
                      <span className="bg-amber-500 text-black text-xs font-black px-1.5 py-0.5 rounded-full">
                        {addCart.reduce((s, c) => s + c.quantity, 0)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-amber-400/70 tabular-nums">{fmtTime(addSecsLeft)}</span>
                    <span className="text-muted-foreground text-xs">{showAddPanel ? "▲" : "▼"}</span>
                  </div>
                </button>

                {showAddPanel && (
                  <div className="border-t border-amber-500/20 px-4 py-4 space-y-4">
                    {/* Category tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {menu.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setActiveCategory(cat.id)}
                          className={cn(
                            "shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors",
                            activeCategory === cat.id
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card border-border text-muted-foreground hover:border-primary/40"
                          )}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>

                    {/* Product grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {activeCat?.products?.map(product => {
                        const qty = miniQty(product.id);
                        return (
                          <div key={product.id} className="bg-card border border-border rounded-xl px-3 py-3 space-y-2">
                            <div>
                              <p className="text-sm font-semibold text-foreground leading-tight">{product.name}</p>
                              <p className="text-xs text-primary font-bold">₹{product.price}</p>
                            </div>
                            {qty === 0 ? (
                              <button
                                onClick={() => addMiniItem(product.id, product.name, product.price)}
                                className="w-full py-1.5 bg-primary/15 border border-primary/30 text-primary rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-primary/25 transition-colors"
                              >
                                <Plus size={11} /> Add
                              </button>
                            ) : (
                              <div className="flex items-center justify-between">
                                <button onClick={() => removeMiniItem(product.id)}
                                  className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                                  <Minus size={11} />
                                </button>
                                <span className="font-black text-foreground tabular-nums">{qty}</span>
                                <button onClick={() => addMiniItem(product.id, product.name, product.price)}
                                  className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                                  <Plus size={11} className="text-primary-foreground" />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Add to order button */}
                    {addCart.length > 0 && (
                      <div className="space-y-2 border-t border-amber-500/20 pt-3">
                        <div className="space-y-1.5">
                          {addCart.map(c => (
                            <div key={c.productId} className="flex items-center justify-between text-sm">
                              <span className="text-foreground/80">{c.productName} ×{c.quantity}</span>
                              <span className="font-bold text-primary">₹{c.price * c.quantity}</span>
                            </div>
                          ))}
                        </div>
                        <button
                          onClick={handleAddItems}
                          disabled={addItemsMutation.isPending}
                          className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {addItemsMutation.isPending
                            ? <><RefreshCw size={14} className="animate-spin" /> Adding…</>
                            : <><ShoppingCart size={14} /> Add ₹{miniTotal} to Order</>}
                        </button>
                        {addItemsMutation.isError && (
                          <p className="text-xs text-destructive text-center">
                            {(addItemsMutation.error as { message?: string })?.message ?? "Failed to add items. Please try again."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Items added success message */}
            {addSuccess && (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-400 shrink-0" />
                <p className="text-sm text-green-400 font-medium">{addSuccess}</p>
              </div>
            )}

            {/* Progress tracker */}
            {!isCancelled && (
              <div className="space-y-2">
                {STATUSES.filter(s => s.key !== "cancelled").map((s, idx) => {
                  const done = idx < currentIdx;
                  const active = idx === currentIdx;
                  const pending = idx > currentIdx;
                  return (
                    <div key={s.key} className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all",
                      active  ? cn(s.bg, "border-2") : "",
                      done    ? "bg-green-500/5 border-green-500/20" : "",
                      pending ? "bg-card border-border opacity-40" : "",
                    )}>
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                        active  ? cn("border-2", s.bg, s.color) : "",
                        done    ? "bg-green-500/20 border border-green-500/40" : "",
                        pending ? "bg-secondary border border-border" : "",
                      )}>
                        {done
                          ? <CheckCircle2 size={16} className="text-green-400" />
                          : active
                          ? <s.icon size={16} className={cn(s.color, active && "animate-pulse")} />
                          : <s.icon size={16} className="text-muted-foreground" />}
                      </div>
                      <div className="flex-1">
                        <p className={cn("font-semibold text-sm", active ? s.color : done ? "text-green-400" : "text-muted-foreground")}>
                          {s.label}
                        </p>
                        {active && s.key === "pending_payment" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Head to the counter to pay ₹{order.totalAmount}</p>
                        )}
                        {active && s.key === "approved" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Payment confirmed, order queued for kitchen</p>
                        )}
                        {active && s.key === "preparing" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Your waffles are being prepared fresh!</p>
                        )}
                        {active && s.key === "ready" && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {order.orderType === "dine_in" ? "Your order will be brought to your table!" : "Collect your order at the counter!"}
                          </p>
                        )}
                        {active && s.key === "completed" && (
                          <p className="text-xs text-muted-foreground mt-0.5">Thank you! Enjoy your waffles 🧇</p>
                        )}
                      </div>
                      {active && (
                        <Zap size={14} className={cn(s.color, "animate-pulse")} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cancelled state */}
            {isCancelled && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-2xl px-4 py-4 text-center space-y-2">
                <Ban size={32} className="text-destructive mx-auto" />
                <p className="font-bold text-destructive">Order Cancelled</p>
                <p className="text-sm text-muted-foreground">Please speak to a staff member if you have questions.</p>
              </div>
            )}

            {/* Items list */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Items</p>
              {order.items.map(item => (
                <div key={item.id} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="font-medium text-foreground text-sm">{item.productName}</span>
                  <span className="font-bold text-primary">×{item.quantity}</span>
                </div>
              ))}
            </div>

            {/* Prominent payment instructions for pending_payment */}
            {order.status === "pending_payment" && (
              <div className="bg-amber-500/10 border-2 border-amber-500/40 rounded-2xl px-5 py-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
                    <MapPin size={18} className="text-amber-400" />
                  </div>
                  <div>
                    <p className="font-bold text-amber-400 text-base leading-tight">Payment Required</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your order is waiting for you</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-foreground/90">
                  <p className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold shrink-0">1.</span>
                    Please visit the counter to complete your payment.
                  </p>
                  <p className="flex items-start gap-2">
                    <span className="text-amber-400 font-bold shrink-0">2.</span>
                    Your order will be prepared immediately after payment confirmation.
                  </p>
                </div>

                <div className="bg-amber-500/15 border border-amber-500/30 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Amount to pay</span>
                  <span className="text-xl font-black text-amber-400">₹{order.totalAmount}</span>
                </div>

                {contactNumber && (
                  <div className="border-t border-amber-500/20 pt-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Phone size={14} className="text-amber-400" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Need help?</p>
                      <a
                        href={`tel:${contactNumber.replace(/\s/g, "")}`}
                        className="font-bold text-amber-400 text-sm hover:underline"
                      >
                        {contactNumber}
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auto-refresh note */}
            {!isCancelled && order.status !== "completed" && (
              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5">
                <RefreshCw size={11} /> This page updates automatically every 5 seconds
              </p>
            )}

            {/* Place another order */}
            {(order.status === "completed" || isCancelled) && (
              <a
                href="/order"
                className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2"
              >
                <ChefHat size={18} /> Order Again
              </a>
            )}
          </>
        )}
      </div>
    </div>
  );
}
