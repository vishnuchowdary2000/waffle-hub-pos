import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useGetPublicMenu, useGetPublicStats, useCreatePublicOrder, getGetPublicStatsQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Minus, Plus, X, ChefHat,
  User, Phone, UtensilsCrossed, ShoppingBag,
  AlertCircle, CheckCircle2, Zap, Clock,
  ArrowRight, Trash2, RefreshCw,
} from "lucide-react";

type Step = "info" | "menu" | "confirm";
type OrderType = "dine_in" | "takeaway";

interface CartItem {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
}

const RUSH_CONFIG = {
  low:      { label: "🟢 Low Rush",      color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  moderate: { label: "🟡 Moderate Rush", color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  high:     { label: "🔴 High Rush",     color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
};

export default function CustomerOrder() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("info");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  const { data: menu = [], isLoading: menuLoading } = useGetPublicMenu();
  const { data: stats } = useGetPublicStats({
    query: { queryKey: getGetPublicStatsQueryKey(), refetchInterval: 10000 },
  });

  const createOrder = useCreatePublicOrder();

  useEffect(() => {
    if (menu.length > 0 && activeCategory === null) {
      setActiveCategory(menu[0].id);
    }
  }, [menu, activeCategory]);

  const addItem = (productId: number, productName: string, price: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === productId);
      if (existing) return prev.map(c => c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId, productName, price, quantity: 1 }];
    });
  };

  const removeItem = (productId: number) => {
    setCart(prev => {
      const existing = prev.find(c => c.productId === productId);
      if (!existing) return prev;
      if (existing.quantity === 1) return prev.filter(c => c.productId !== productId);
      return prev.map(c => c.productId === productId ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  const removeAll = (productId: number) => setCart(prev => prev.filter(c => c.productId !== productId));

  const cartQty = (productId: number) => cart.find(c => c.productId === productId)?.quantity ?? 0;
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + c.price * c.quantity, 0);

  const handlePlaceOrder = () => {
    createOrder.mutate(
      {
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          orderType,
          notes: notes.trim() || undefined,
          items: cart.map(c => ({
            productId: c.productId,
            productName: c.productName,
            price: c.price,
            quantity: c.quantity,
            itemOrderType: orderType,
          })),
        },
      },
      {
        onSuccess: (order) => {
          navigate(`/track/${order.orderNumber}`);
        },
      }
    );
  };

  const rushLevel = (stats?.rushLevel ?? "low") as "low" | "moderate" | "high";
  const rush = RUSH_CONFIG[rushLevel];
  const activeCat = menu.find(c => c.id === activeCategory);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
              <ChefHat size={18} className="text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm leading-tight">The Waffle Hub</p>
              <p className="text-xs text-muted-foreground">Self Order</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Rush level pill */}
            {stats && (
              <div className={cn("hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border", rush.bg, rush.color)}>
                {rush.label}
              </div>
            )}
            {/* Cart button (visible in menu step) */}
            {step === "menu" && totalItems > 0 && (
              <button
                onClick={() => setStep("confirm")}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-sm font-bold"
              >
                <ShoppingCart size={15} />
                {totalItems} · ₹{totalAmount}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* ── Preparing count + Rush (mobile) ────────────────────────────── */}
        <div className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-sm", rush.bg)}>
          <div className="flex items-center gap-2">
            <Zap size={14} className={rush.color} />
            <span className={cn("font-semibold", rush.color)}>{rush.label}</span>
          </div>
          <span className="text-muted-foreground text-xs">
            Orders being prepared: <span className="font-bold text-foreground">{stats?.preparing ?? 0}</span>
          </span>
        </div>

        {/* ── Disclaimer ─────────────────────────────────────────────────── */}
        <div className="flex gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <Clock size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-400/90 leading-relaxed">
            Freshly prepared items may require waiting time depending on current kitchen workload.
            Minimum preparation time is usually <strong>10–15 minutes</strong>.
          </p>
        </div>

        {/* ── Step 1: Customer Info ───────────────────────────────────────── */}
        {step === "info" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Your Details</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Let us know who to call when your order is ready</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <User size={12} /> Name *
                </label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-card border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Phone size={12} /> Mobile Number
                </label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Optional, for order updates"
                  inputMode="numeric"
                  className="w-full bg-card border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Order Type *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: "dine_in", label: "Dine In", icon: UtensilsCrossed, sub: "Eat here" },
                    { value: "takeaway", label: "Takeaway", icon: ShoppingBag, sub: "Pack & go" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setOrderType(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all",
                        orderType === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/50"
                      )}
                    >
                      <opt.icon size={24} />
                      <div className="text-center">
                        <p className="font-bold text-sm">{opt.label}</p>
                        <p className="text-xs opacity-70">{opt.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              disabled={!name.trim()}
              onClick={() => setStep("menu")}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40"
            >
              Browse Menu <ArrowRight size={18} />
            </button>
          </div>
        )}

        {/* ── Step 2: Menu ───────────────────────────────────────────────── */}
        {step === "menu" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground">Menu</h2>
                <p className="text-sm text-muted-foreground">Hi {name}! Select your items</p>
              </div>
              <button onClick={() => setStep("info")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={13} /> Back
              </button>
            </div>

            {menuLoading ? (
              <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-primary" size={24} /></div>
            ) : (
              <>
                {/* Category tabs */}
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {menu.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      className={cn(
                        "px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors shrink-0",
                        activeCategory === cat.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Products */}
                <div className="space-y-2">
                  {activeCat?.products.map(product => {
                    const qty = cartQty(product.id);
                    return (
                      <div key={product.id} className="bg-card border border-border rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">{product.name}</p>
                          {product.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{product.description}</p>
                          )}
                          <p className="text-primary font-bold mt-1">₹{product.price}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {qty === 0 ? (
                            <button
                              onClick={() => addItem(product.id, product.name, product.price)}
                              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                            >
                              <Plus size={14} /> Add
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => removeItem(product.id)}
                                className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center hover:bg-muted transition-colors">
                                <Minus size={15} className="text-foreground" />
                              </button>
                              <span className="text-lg font-bold text-foreground w-6 text-center tabular-nums">{qty}</span>
                              <button onClick={() => addItem(product.id, product.name, product.price)}
                                className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center hover:opacity-90 transition-colors">
                                <Plus size={15} className="text-primary-foreground" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Sticky cart bar */}
            {totalItems > 0 && (
              <div className="sticky bottom-4 pt-2">
                <button
                  onClick={() => setStep("confirm")}
                  className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-between px-5 shadow-lg shadow-primary/20"
                >
                  <span className="bg-primary-foreground/20 text-primary-foreground px-2.5 py-0.5 rounded-lg text-sm font-black">
                    {totalItems}
                  </span>
                  <span>Review Order</span>
                  <span className="font-black">₹{totalAmount}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Confirm ────────────────────────────────────────────── */}
        {step === "confirm" && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Review Order</h2>
              <button onClick={() => setStep("menu")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <X size={13} /> Edit
              </button>
            </div>

            {/* Customer summary */}
            <div className="bg-card border border-border rounded-2xl px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <User size={13} className="text-muted-foreground" />
                <span className="font-semibold text-foreground">{name}</span>
                {phone && <span className="text-muted-foreground">· {phone}</span>}
              </div>
              <div className="flex items-center gap-2 text-sm">
                {orderType === "dine_in"
                  ? <UtensilsCrossed size={13} className="text-muted-foreground" />
                  : <ShoppingBag size={13} className="text-muted-foreground" />}
                <span className="text-muted-foreground">{orderType === "dine_in" ? "Dine In" : "Takeaway"}</span>
              </div>
            </div>

            {/* Cart items */}
            <div className="space-y-2">
              {cart.map(item => (
                <div key={item.productId} className="bg-card border border-border rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold text-foreground text-sm">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">₹{item.price} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => removeItem(item.productId)}
                        className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                        <Minus size={12} />
                      </button>
                      <span className="font-bold text-foreground w-5 text-center">{item.quantity}</span>
                      <button onClick={() => addItem(item.productId, item.productName, item.price)}
                        className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                        <Plus size={12} className="text-primary-foreground" />
                      </button>
                    </div>
                    <span className="font-bold text-primary ml-1 w-16 text-right">₹{item.price * item.quantity}</span>
                    <button onClick={() => removeAll(item.productId)} className="text-muted-foreground hover:text-destructive ml-1">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
                Special Instructions (optional)
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. No sugar, extra crispy…"
                rows={2}
                className="w-full bg-card border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-sm resize-none"
              />
            </div>

            {/* Total */}
            <div className="bg-card border border-border rounded-2xl px-4 py-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total Amount</span>
              <span className="text-2xl font-black text-foreground">₹{totalAmount}</span>
            </div>

            {/* Pay at counter notice */}
            <div className="flex gap-3 bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-400/90 leading-relaxed">
                <strong>Please pay at the counter.</strong> Your order will be prepared after payment approval.
              </p>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={cart.length === 0 || createOrder.isPending}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {createOrder.isPending
                ? <><RefreshCw size={16} className="animate-spin" /> Placing Order…</>
                : <><CheckCircle2 size={18} /> Place Order</>}
            </button>

            {createOrder.isError && (
              <p className="text-sm text-destructive text-center">Failed to place order. Please try again.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
