import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  useGetPublicMenu,
  useGetPublicStats,
  useCreatePublicOrder,
  useLookupPublicCustomer,
  useGetPublicStoreStatus,
  getLookupPublicCustomerQueryKey,
  getGetPublicStatsQueryKey,
  getGetPublicStoreStatusQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  ShoppingCart, Minus, Plus, X, ChefHat,
  User, Phone, UtensilsCrossed, ShoppingBag,
  AlertCircle, CheckCircle2, Zap, Clock,
  ArrowRight, Trash2, RefreshCw, Star, History,
  Megaphone, Ban,
} from "lucide-react";

type Step = "info" | "menu" | "confirm";
type ItemOrderType = "dine_in" | "takeaway";

interface CartItem {
  productId: number;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: ItemOrderType;
}

const RUSH_CONFIG = {
  low:      { label: "🟢 Low Rush",      color: "text-green-400",  bg: "bg-green-500/10 border-green-500/20" },
  moderate: { label: "🟡 Moderate Rush", color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20" },
  high:     { label: "🔴 High Rush",     color: "text-red-400",    bg: "bg-red-500/10 border-red-500/20" },
};

function phoneDigitCount(value: string) {
  return value.replace(/\D/g, "").length;
}

export default function CustomerOrder() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("info");

  // Customer info
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Default type for new items added in menu step
  const [defaultItemType, setDefaultItemType] = useState<ItemOrderType>("dine_in");

  // Cart — each row is a product+type combination
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // Validation errors
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Customer lookup
  const autoFilledNameRef = useRef<string | null>(null);

  const { data: menu = [], isLoading: menuLoading } = useGetPublicMenu();
  const { data: stats } = useGetPublicStats({
    query: { queryKey: getGetPublicStatsQueryKey(), refetchInterval: 10000 },
  });
  const { data: storeStatus } = useGetPublicStoreStatus({
    query: { queryKey: getGetPublicStoreStatusQueryKey(), refetchInterval: 30000 },
  });
  const storeClosed = storeStatus !== undefined && !storeStatus.isOpen;
  const activeAnnouncements = storeStatus?.announcements ?? [];
  const createOrder = useCreatePublicOrder();

  const digits = phoneDigitCount(phone);
  const lookupEnabled = digits >= 10;

  const { data: customerProfile, isFetching: lookingUp, isError: notFound } = useLookupPublicCustomer(
    { phone },
    {
      query: {
        queryKey: getLookupPublicCustomerQueryKey({ phone }),
        enabled: lookupEnabled,
        retry: false,
        staleTime: 30_000,
      },
    }
  );

  // Auto-fill name from found customer
  useEffect(() => {
    if (customerProfile) {
      if (!name.trim() || name === autoFilledNameRef.current) {
        setName(customerProfile.name);
        autoFilledNameRef.current = customerProfile.name;
        setNameError("");
      }
    }
  }, [customerProfile]);

  // Clear auto-filled name if phone drops below 10 digits
  useEffect(() => {
    if (!lookupEnabled && name === autoFilledNameRef.current) {
      setName("");
      autoFilledNameRef.current = null;
    }
  }, [lookupEnabled]);

  useEffect(() => {
    if (menu.length > 0 && activeCategory === null) {
      setActiveCategory(menu[0].id);
    }
  }, [menu, activeCategory]);

  // ── Cart operations ────────────────────────────────────────────────────────
  // Add one unit using the current default type; dedup same product+type
  const addItem = (productId: number, productName: string, price: number) => {
    const itype = defaultItemType;
    setCart(prev => {
      const idx = prev.findIndex(c => c.productId === productId && c.itemOrderType === itype);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId, productName, price, quantity: 1, itemOrderType: itype }];
    });
  };

  // Remove one unit using default type first; fall back to any matching product
  const removeItem = (productId: number) => {
    const itype = defaultItemType;
    setCart(prev => {
      let idx = prev.findIndex(c => c.productId === productId && c.itemOrderType === itype);
      if (idx < 0) idx = prev.findIndex(c => c.productId === productId);
      if (idx < 0) return prev;
      const item = prev[idx];
      if (item.quantity === 1) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity - 1 } : c);
    });
  };

  // Toggle a row's type (confirm step) — merges into existing row if target type exists
  const toggleItemType = (idx: number) => {
    setCart(prev => {
      const item = prev[idx];
      const newType: ItemOrderType = item.itemOrderType === "dine_in" ? "takeaway" : "dine_in";
      const mergeIdx = prev.findIndex((c, i) => i !== idx && c.productId === item.productId && c.itemOrderType === newType);
      if (mergeIdx >= 0) {
        return prev
          .map((c, i) => i === mergeIdx ? { ...c, quantity: c.quantity + item.quantity } : c)
          .filter((_, i) => i !== idx);
      }
      return prev.map((c, i) => i === idx ? { ...c, itemOrderType: newType } : c);
    });
  };

  const updateCartRow = (idx: number, delta: number) => {
    setCart(prev => {
      const item = prev[idx];
      if (!item) return prev;
      if (item.quantity + delta <= 0) return prev.filter((_, i) => i !== idx);
      return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + delta } : c);
    });
  };

  const removeCartRow = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  // Total qty for a product across all types (for menu step badge)
  const cartQty = (productId: number) =>
    cart.filter(c => c.productId === productId).reduce((s, c) => s + c.quantity, 0);

  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const totalAmount = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const packagingCount = cart.filter(c => c.itemOrderType === "takeaway").reduce((s, c) => s + c.quantity, 0);

  // Derive top-level orderType from items
  const derivedOrderType = (): string => {
    const hasDI = cart.some(c => c.itemOrderType === "dine_in");
    const hasTA = cart.some(c => c.itemOrderType === "takeaway");
    if (hasDI && hasTA) return "mixed";
    if (hasTA) return "takeaway";
    return "dine_in";
  };

  // ── Step navigation ────────────────────────────────────────────────────────
  const handleContinue = () => {
    let hasError = false;
    if (!name.trim()) { setNameError("Name is required"); hasError = true; }
    else setNameError("");
    if (!phone.trim()) { setPhoneError("Mobile number is required"); hasError = true; }
    else if (digits < 10) { setPhoneError("Enter at least 10 digits"); hasError = true; }
    else setPhoneError("");
    if (!hasError) setStep("menu");
  };

  const handlePlaceOrder = () => {
    createOrder.mutate(
      {
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim(),
          customerId: customerProfile?.id,
          orderType: derivedOrderType(),
          notes: notes.trim() || undefined,
          items: cart.map(c => ({
            productId: c.productId,
            productName: c.productName,
            price: c.price,
            quantity: c.quantity,
            itemOrderType: c.itemOrderType,
          })),
        },
      },
      { onSuccess: (order) => navigate(`/track/${order.orderNumber}`) }
    );
  };

  // ── Derived display ────────────────────────────────────────────────────────
  const rushLevel = (stats?.rushLevel ?? "low") as "low" | "moderate" | "high";
  const rush = RUSH_CONFIG[rushLevel];
  const activeCat = menu.find(c => c.id === activeCategory);
  const isReturningCustomer = lookupEnabled && !!customerProfile;
  const isNewCustomer = lookupEnabled && !lookingUp && notFound;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
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
            {stats && (
              <div className={cn("hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border", rush.bg, rush.color)}>
                {rush.label}
              </div>
            )}
            {step === "menu" && totalItems > 0 && (
              <button onClick={() => setStep("confirm")}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-sm font-bold">
                <ShoppingCart size={15} />
                {totalItems} · ₹{totalAmount}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Store closed banner */}
        {storeClosed && (
          <div className="flex gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-4">
            <Ban size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-400">We are currently closed</p>
              <p className="text-xs text-red-400/80 mt-0.5">
                Sorry, we are currently closed. Please visit us during business hours.
              </p>
              {storeStatus?.openTime && storeStatus?.closeTime && (
                <p className="text-xs text-red-400/70 mt-1">
                  Operating hours: {storeStatus.openTime} – {storeStatus.closeTime}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Active announcements */}
        {activeAnnouncements.length > 0 && activeAnnouncements.map(a => (
          <div key={a.id} className="flex gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
            <Megaphone size={15} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300 leading-relaxed">{a.message}</p>
          </div>
        ))}

        {/* Store status pill */}
        {storeStatus && (
          <div className={cn(
            "flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border",
            storeStatus.isOpen
              ? "bg-green-500/10 border-green-500/25 text-green-400"
              : "bg-red-500/10 border-red-500/25 text-red-400"
          )}>
            <span className={cn("w-2 h-2 rounded-full", storeStatus.isOpen ? "bg-green-400" : "bg-red-400")} />
            {storeStatus.isOpen ? "Currently Accepting Orders" : "Currently Closed"}
            {storeStatus.openTime && storeStatus.closeTime && (
              <span className="ml-auto text-muted-foreground font-normal">
                {storeStatus.openTime} – {storeStatus.closeTime}
              </span>
            )}
          </div>
        )}

        {/* Rush bar */}
        {!storeClosed && (
        <div className={cn("flex items-center justify-between rounded-xl border px-4 py-3 text-sm", rush.bg)}>
          <div className="flex items-center gap-2">
            <Zap size={14} className={rush.color} />
            <span className={cn("font-semibold", rush.color)}>{rush.label}</span>
          </div>
          <span className="text-muted-foreground text-xs">
            Preparing: <span className="font-bold text-foreground">{stats?.preparing ?? 0}</span>
          </span>
        </div>
        )}

        {/* Disclaimer */}
        <div className="flex gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
          <Clock size={15} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-400/90 leading-relaxed">
            Freshly prepared items may require waiting time. Minimum preparation time is usually <strong>10–15 minutes</strong>.
          </p>
        </div>

        {/* ── STEP 1: Info ─────────────────────────────────────────────────── */}
        {step === "info" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-foreground">Your Details</h2>
              <p className="text-sm text-muted-foreground mt-0.5">We'll call you when your order is ready</p>
            </div>

            <div className="space-y-4">
              {/* Mobile Number — first, triggers auto-lookup */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Phone size={12} /> Mobile Number *
                </label>
                <div className="relative">
                  <input
                    value={phone}
                    onChange={e => { setPhone(e.target.value); if (phoneError) setPhoneError(""); }}
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    maxLength={15}
                    className={cn(
                      "w-full bg-card border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base pr-10",
                      phoneError ? "border-destructive focus:ring-destructive/50" : "border-input"
                    )}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {lookingUp && <RefreshCw size={15} className="animate-spin text-muted-foreground" />}
                    {isReturningCustomer && <CheckCircle2 size={15} className="text-green-400" />}
                  </div>
                </div>
                {phoneError && (
                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                    <AlertCircle size={11} /> {phoneError}
                  </p>
                )}
              </div>

              {/* Returning customer card */}
              {isReturningCustomer && customerProfile && (
                <div className="bg-green-500/8 border border-green-500/25 rounded-2xl px-4 py-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={14} className="text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Welcome back, {customerProfile.name}!</p>
                      <p className="text-xs text-muted-foreground">
                        {customerProfile.orderCount} order{customerProfile.orderCount !== 1 ? "s" : ""} · ₹{customerProfile.totalSpending.toFixed(0)} total spent
                      </p>
                    </div>
                  </div>
                  {customerProfile.favoriteItems && (
                    <div className="flex items-start gap-1.5 text-xs text-amber-400/90">
                      <Star size={11} className="mt-0.5 shrink-0 fill-amber-400" />
                      <span>Favourites: {customerProfile.favoriteItems}</span>
                    </div>
                  )}
                  {customerProfile.recentOrders && customerProfile.recentOrders.length > 0 && (
                    <div className="border-t border-green-500/15 pt-2 space-y-1.5">
                      <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                        <History size={11} /> Recent orders
                      </p>
                      {customerProfile.recentOrders.map(o => (
                        <div key={o.orderNumber} className="flex items-start gap-2 text-xs">
                          <span className="font-mono text-muted-foreground shrink-0">{o.orderNumber}</span>
                          <span className="text-foreground/80 flex-1 truncate">{o.itemSummary}</span>
                          <span className="text-primary font-semibold shrink-0">₹{o.totalAmount}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* New customer indicator */}
              {isNewCustomer && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-xl px-3 py-2">
                  <User size={12} />
                  <span>New customer — we'll create your profile when you order</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <User size={12} /> Name *
                </label>
                <input
                  value={name}
                  onChange={e => {
                    setName(e.target.value);
                    autoFilledNameRef.current = null;
                    if (nameError) setNameError("");
                  }}
                  placeholder="Your name"
                  className={cn(
                    "w-full bg-card border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring text-base",
                    nameError ? "border-destructive focus:ring-destructive/50" : "border-input"
                  )}
                />
                {nameError && (
                  <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                    <AlertCircle size={11} /> {nameError}
                  </p>
                )}
              </div>

              {/* Default order type (sets the starting type for new cart items) */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 block">
                  Default Order Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { value: "dine_in"  as const, label: "Dine In",  icon: UtensilsCrossed, sub: "Eat here" },
                    { value: "takeaway" as const, label: "Takeaway", icon: ShoppingBag,     sub: "Pack & go" },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setDefaultItemType(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-2 py-5 rounded-2xl border-2 transition-all",
                        defaultItemType === opt.value
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
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  You can change individual items after adding them
                </p>
              </div>
            </div>

            <button
              onClick={handleContinue}
              disabled={storeClosed}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {storeClosed ? <><Ban size={18} /> Ordering Unavailable</> : <>Browse Menu <ArrowRight size={18} /></>}
            </button>
          </div>
        )}

        {/* ── STEP 2: Menu ──────────────────────────────────────────────────── */}
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

            {/* Default type pill — visible reminder */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Adding as:</span>
              <button
                onClick={() => setDefaultItemType(t => t === "dine_in" ? "takeaway" : "dine_in")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors",
                  defaultItemType === "takeaway"
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                    : "bg-secondary text-foreground border-border"
                )}
              >
                {defaultItemType === "takeaway"
                  ? <><ShoppingBag size={11} /> Takeaway</>
                  : <><UtensilsCrossed size={11} /> Dine In</>}
              </button>
              <span className="text-muted-foreground">(tap to switch)</span>
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
                              onClick={() => !storeClosed && addItem(product.id, product.name, product.price)}
                              disabled={storeClosed}
                              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* ── STEP 3: Confirm ───────────────────────────────────────────────── */}
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
                {isReturningCustomer && (
                  <span className="text-xs bg-green-500/15 text-green-400 px-2 py-0.5 rounded-full border border-green-500/25 font-semibold">
                    Returning
                  </span>
                )}
              </div>
              {packagingCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <ShoppingBag size={12} />
                  <span>{packagingCount} item{packagingCount !== 1 ? "s" : ""} need packaging</span>
                </div>
              )}
            </div>

            {/* Cart rows — per product+type, with toggle */}
            <div className="space-y-2">
              {cart.map((item, idx) => (
                <div key={`${item.productId}-${item.itemOrderType}-${idx}`} className="bg-card border border-border rounded-xl px-4 py-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">₹{item.price} each</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => updateCartRow(idx, -1)}
                          className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center">
                          <Minus size={12} />
                        </button>
                        <span className="font-bold text-foreground w-5 text-center tabular-nums">{item.quantity}</span>
                        <button onClick={() => updateCartRow(idx, 1)}
                          className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                          <Plus size={12} className="text-primary-foreground" />
                        </button>
                      </div>
                      <span className="font-bold text-primary ml-1 w-16 text-right">₹{item.price * item.quantity}</span>
                      <button onClick={() => removeCartRow(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  {/* Per-item type toggle */}
                  <button
                    onClick={() => toggleItemType(idx)}
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors",
                      item.itemOrderType === "takeaway"
                        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                        : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                    )}
                  >
                    {item.itemOrderType === "takeaway"
                      ? <><ShoppingBag size={11} /> Takeaway — tap to switch to Dine In</>
                      : <><UtensilsCrossed size={11} /> Dine In — tap to switch to Takeaway</>}
                  </button>
                </div>
              ))}
            </div>

            {/* Special instructions */}
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
              <div>
                <span className="text-sm text-muted-foreground">Total Amount</span>
                {packagingCount > 0 && (
                  <p className="text-xs text-blue-400 mt-0.5">{packagingCount} item{packagingCount !== 1 ? "s" : ""} need packaging</p>
                )}
              </div>
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
              disabled={cart.length === 0 || createOrder.isPending || storeClosed}
              className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {createOrder.isPending
                ? <><RefreshCw size={16} className="animate-spin" /> Placing Order…</>
                : storeClosed
                  ? <><Ban size={18} /> Store is Closed</>
                  : <><CheckCircle2 size={18} /> Place Order</>}
            </button>

            {createOrder.isError && (
              <p className="text-sm text-destructive text-center">
                {(createOrder.error as { message?: string })?.message ?? "Failed to place order. Please try again."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
