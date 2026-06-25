import { useState, useRef, useEffect } from "react";
import {
  useListCategories, useListProducts, useCreateOrder,
  useCreateOrderPayment, useUpdateOrderStatus, useListCustomers, useListOrders,
  useListOffers, useAddAddonItems,
  getListOrdersQueryKey, getGetDashboardQueryKey, getListCustomersQueryKey,
} from "@workspace/api-client-react";
import type { Offer, ListProductsQueryResult, ListCategoriesQueryResult, ListOrdersQueryResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate, STATUS_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus, Minus, Trash2, ShoppingCart, Search,
  Banknote, Smartphone, CreditCard, Heart,
  CheckCircle, X, ShoppingBag, UtensilsCrossed, UserRound, Clock, Tag,
  Bell, BellOff, QrCode,
} from "lucide-react";

type ItemOrderType = "dine_in" | "takeaway";

type CartItem = {
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: ItemOrderType;
};

type PlacedOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  orderType: string;
  totalAmount: number;
  items: { productName: string; quantity: number; price: number; itemOrderType: string }[];
};

type NotifOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  totalAmount: number;
  items: { productName: string; quantity: number }[];
};

type Customer = {
  id: number;
  name: string;
  phone: string;
  orderCount: number;
  totalSpending: number;
  favoriteItems?: string | null;
  lastOrderDate?: string | null;
};

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;
const ORDER_TYPE_LABELS: Record<string, string> = { dine_in: "Dine In", takeaway: "Takeaway", delivery: "Delivery" };

function playChime() {
  try {
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    const notes = [880, 1100, 1320];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.connect(gain);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.start(t);
      osc.stop(t + 0.35);
      if (i === notes.length - 1) osc.onended = () => ctx.close();
    });
  } catch {
    // browser may block AudioContext without user interaction
  }
}

type OfferParams = {
  buyQty?: number; getQty?: number;
  percentage?: number;
  amount?: number;
  minBill?: number; discountAmount?: number;
};

function computeDiscount(offer: Offer, items: CartItem[]): number {
  const p = offer.params as OfferParams;
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  switch (offer.type) {
    case "percentage":
      return Math.round(subtotal * (p.percentage ?? 0)) / 100;
    case "fixed_amount":
      return Math.min(p.amount ?? 0, subtotal);
    case "min_bill":
      return subtotal >= (p.minBill ?? 0) ? (p.discountAmount ?? 0) : 0;
    case "buy_x_get_y": {
      const buyQty = p.buyQty ?? 0;
      const getQty = p.getQty ?? 0;
      if (buyQty <= 0 || getQty <= 0) return 0;
      const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
      const freeUnits = Math.floor(totalUnits / (buyQty + getQty)) * getQty;
      if (freeUnits <= 0) return 0;
      const units: number[] = [];
      for (const item of items) for (let q = 0; q < item.quantity; q++) units.push(item.price);
      units.sort((a, b) => a - b);
      return units.slice(0, freeUnits).reduce((s, p) => s + p, 0);
    }
    default: return 0;
  }
}

export default function Counter() {
  const qc = useQueryClient();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [showDrop, setShowDrop] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  const [selectedOfferId, setSelectedOfferId] = useState<number | null>(null);
  const [addonOrderId, setAddonOrderId] = useState<number | null>(null);

  // ── QR Order Notifications ────────────────────────────────────────────────
  const [notifOrders, setNotifOrders] = useState<NotifOrder[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem("wh_notif_sound") !== "off"; } catch { return true; }
  });
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const { data: qrOrders = [] } = useListOrders(
    { source: "customer", status: "pending_payment" } as Parameters<typeof useListOrders>[0],
    { query: { refetchInterval: 3000, queryKey: getListOrdersQueryKey({ source: "customer", status: "pending_payment" }) } }
  );

  useEffect(() => {
    const newOnes = qrOrders.filter(o => !seenIdsRef.current.has(o.id));
    if (newOnes.length > 0) {
      setNotifOrders(prev => [
        ...newOnes.map(o => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          totalAmount: o.totalAmount,
          items: o.items.map(i => ({ productName: i.productName, quantity: i.quantity })),
        })),
        ...prev,
      ]);
      if (initializedRef.current && soundEnabledRef.current) playChime();
      newOnes.forEach(o => seenIdsRef.current.add(o.id));
    }
    if (!initializedRef.current) initializedRef.current = true;
  }, [qrOrders]);

  const toggleSound = () => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem("wh_notif_sound", next ? "on" : "off"); } catch {}
      return next;
    });
  };

  const dismissNotif = (id: number) => setNotifOrders(prev => prev.filter(o => o.id !== id));

  const { data: categories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });
  const { data: activeOffers = [] } = useListOffers({ active: true });
  const createOrder = useCreateOrder();
  const createPayment = useCreateOrderPayment();
  const updateStatus = useUpdateOrderStatus();

  // Customer search
  const { data: customerResults = [] } = useListCustomers(
    { search: customerQuery },
    { query: { enabled: customerQuery.length >= 2, queryKey: getListCustomersQueryKey({ search: customerQuery }) } }
  );

  // Customer order history
  const { data: customerOrders = [] } = useListOrders(
    { customerId: selectedCustomer?.id ?? undefined },
    { query: { enabled: !!selectedCustomer?.id, queryKey: getListOrdersQueryKey({ customerId: selectedCustomer?.id ?? undefined }) } }
  );

  // Active kitchen orders (for Add Items flow)
  const { data: kitchenOrders = [] } = useListOrders(
    { status: "approved,preparing,ready" } as Parameters<typeof useListOrders>[0],
    { query: { refetchInterval: 5000, queryKey: getListOrdersQueryKey({ status: "approved,preparing,ready" }) } }
  );
  const unpaidKitchenOrders = kitchenOrders.filter(o => !o.payment || o.payment.balance > 0);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setShowDrop(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    setCustomerQuery("");
    setShowDrop(false);
  };

  const clearSelectedCustomer = () => {
    setSelectedCustomer(null);
    setCustomerId(null);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerQuery("");
  };

  const products = allProducts.filter(p => {
    const matchesCat = activeCategory == null || p.categoryId === activeCategory;
    const catActive = p.categoryId == null || categories.some(c => c.id === p.categoryId && c.active);
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && catActive && matchesSearch;
  });

  // Default item type matches header selection (delivery → takeaway packaging)
  const defaultItemType = (): ItemOrderType => orderType === "dine_in" ? "dine_in" : "takeaway";

  const addToCart = (p: typeof allProducts[number]) => {
    const itype = defaultItemType();
    setCart(prev => {
      // Same product + same item type → increment existing row
      const existing = prev.findIndex(c => c.productId === p.id && c.itemOrderType === itype);
      if (existing >= 0) {
        return prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { productId: p.id, productName: p.name, price: p.price, quantity: 1, itemOrderType: itype }];
    });
  };

  const updateQty = (idx: number, delta: number) => {
    setCart(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + delta };
      if (updated[idx].quantity <= 0) updated.splice(idx, 1);
      return updated;
    });
  };

  // Toggle item type — merge into existing row if one already exists for that type
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

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));
  const subtotal = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const selectedOffer = activeOffers.find(o => o.id === selectedOfferId) ?? null;
  const offerDiscount = selectedOffer ? Math.min(computeDiscount(selectedOffer, cart), subtotal) : 0;
  const total = subtotal - offerDiscount;

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerId(null);
    setSelectedCustomer(null);
    setCustomerQuery("");
    setNotes("");
    setSelectedOfferId(null);
  };

  const placeOrder = () => {
    if (!customerName.trim() || cart.length === 0) return;
    createOrder.mutate({
      data: {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        customerId,
        orderType,
        notes: notes.trim() || undefined,
        offerId: selectedOfferId ?? undefined,
        items: cart.map(c => ({
          productId: c.productId,
          productName: c.productName,
          price: c.price,
          quantity: c.quantity,
          itemOrderType: c.itemOrderType,
        })),
      },
    } as Parameters<typeof createOrder.mutate>[0], {
      onSuccess: (order) => {
        setPlacedOrder({
          id: order.id,
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          orderType: order.orderType,
          totalAmount: order.totalAmount,
          items: order.items,
        });
        resetForm();
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      },
    });
  };

  const recentCompletedOrders = customerOrders.filter(o => o.status === "completed").slice(0, 3);

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">Order Taking</h1>
            <div className="flex items-center gap-2">
              {notifOrders.length > 0 && (
                <span className="flex items-center gap-1 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                  <QrCode size={10} /> {notifOrders.length} QR
                </span>
              )}
              <button
                onClick={toggleSound}
                title={soundEnabled ? "Sound ON — click to mute" : "Sound OFF — click to enable"}
                className={cn(
                  "p-1.5 rounded-lg border transition-colors",
                  soundEnabled
                    ? "text-amber-400 border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
                    : "text-muted-foreground border-border bg-secondary hover:border-border"
                )}
              >
                {soundEnabled ? <Bell size={14} /> : <BellOff size={14} />}
              </button>
            </div>
          </div>

          {/* QR Order Notification Cards */}
          {notifOrders.length > 0 && (
            <div className="space-y-2">
              {notifOrders.map(o => (
                <div key={o.id}
                  className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2.5 shadow-sm shadow-amber-500/10">
                  <div className="shrink-0 w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center mt-0.5">
                    <QrCode size={14} className="text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-amber-400">{o.orderNumber}</span>
                      <span className="text-xs text-foreground font-medium truncate">{o.customerName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {o.items.map(i => `${i.productName} ×${i.quantity}`).join(", ")}
                    </p>
                    <p className="text-xs font-bold text-primary mt-0.5">{formatCurrency(o.totalAmount)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <button
                      onClick={() => {
                        dismissNotif(o.id);
                        updateStatus.mutate({ id: o.id, data: { status: "approved" } });
                      }}
                      className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black rounded-md px-2 py-0.5 leading-tight"
                    >
                      Accept
                    </button>
                    <button onClick={() => dismissNotif(o.id)}
                      className="text-muted-foreground hover:text-foreground p-0.5">
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Kitchen Orders — Add Items to Unpaid Orders */}
          {unpaidKitchenOrders.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-0.5">
                Kitchen Orders (Unpaid)
              </p>
              {unpaidKitchenOrders.map(o => (
                <div key={o.id}
                  className="flex items-center gap-2 bg-secondary border border-border rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">{o.orderNumber}</span>
                      <span className="text-xs text-muted-foreground truncate">{o.customerName}</span>
                    </div>
                    <p className="text-xs text-primary font-semibold mt-0.5">{formatCurrency(o.totalAmount)}</p>
                  </div>
                  <button
                    onClick={() => setAddonOrderId(o.id)}
                    className="shrink-0 text-xs font-bold bg-primary/10 border border-primary/30 text-primary rounded-lg px-2.5 py-1.5 hover:bg-primary/20 transition-colors whitespace-nowrap"
                  >
                    + Add Items
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setActiveCategory(null)}
              className={cn("shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeCategory == null ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
            >All</button>
            {categories.filter(c => c.active).map(c => (
              <button key={c.id} onClick={() => setActiveCategory(c.id)}
                className={cn("shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}
              >{c.name}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {products.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No products found</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {products.map(p => {
                const inCart = cart.find(c => c.productId === p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className={cn("relative rounded-xl p-4 text-left border transition-all active:scale-95",
                      inCart ? "bg-primary/15 border-primary/50 shadow-md" : "bg-card border-card-border hover:border-primary/30")}>
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground text-xs font-bold">{inCart.quantity}</span>
                      </div>
                    )}
                    <p className="font-semibold text-sm text-foreground leading-tight mb-1">{p.name}</p>
                    {p.categoryName && <p className="text-xs text-muted-foreground mb-2">{p.categoryName}</p>}
                    <p className="text-primary font-bold text-base">{formatCurrency(p.price)}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Order form */}
      <div className="md:w-80 lg:w-96 bg-card border-t md:border-t-0 md:border-l border-card-border flex flex-col max-h-80 md:max-h-none">
        <div className="p-4 border-b border-card-border space-y-3 shrink-0">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" /> New Order
          </h2>

          {/* Order type — sets default for new items added to cart */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Add items as:</p>
            <div className="grid grid-cols-3 gap-1.5">
              {ORDER_TYPES.map(t => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={cn("py-2 rounded-lg text-xs font-semibold transition-colors border",
                    orderType === t ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent hover:border-border")}>
                  {ORDER_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Customer search */}
          <div ref={dropRef} className="relative">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search existing customer..."
                value={customerQuery}
                onChange={e => { setCustomerQuery(e.target.value); setShowDrop(true); }}
                onFocus={() => { if (customerQuery.length >= 2) setShowDrop(true); }}
                className="w-full bg-background border border-input rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Customer dropdown */}
            {showDrop && customerQuery.length >= 2 && (
              <div className="absolute z-20 top-full inset-x-0 mt-1 bg-popover border border-border rounded-xl shadow-2xl max-h-52 overflow-y-auto">
                {customerResults.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground text-center">No customers found</p>
                ) : (
                  customerResults.map(c => (
                    <button key={c.id} onClick={() => handleSelectCustomer(c)}
                      className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors border-b border-border/40 last:border-0 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-primary font-semibold">{formatCurrency(c.totalSpending)}</p>
                        <p className="text-xs text-muted-foreground">{c.orderCount} orders</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected customer card */}
          {selectedCustomer && (
            <div className="bg-primary/8 border border-primary/25 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserRound size={14} className="text-primary shrink-0" />
                  <span className="font-semibold text-sm text-foreground">{selectedCustomer.name}</span>
                </div>
                <button onClick={clearSelectedCustomer} className="text-muted-foreground hover:text-foreground p-0.5">
                  <X size={13} />
                </button>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span>{selectedCustomer.orderCount} orders</span>
                <span>·</span>
                <span>{formatCurrency(selectedCustomer.totalSpending)} total</span>
                {selectedCustomer.lastOrderDate && (
                  <>
                    <span>·</span>
                    <span>Last: {formatDate(selectedCustomer.lastOrderDate)}</span>
                  </>
                )}
              </div>
              {selectedCustomer.favoriteItems && (
                <p className="text-xs text-muted-foreground truncate">
                  Favorites: {selectedCustomer.favoriteItems}
                </p>
              )}
              {/* Order history */}
              {recentCompletedOrders.length > 0 && (
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <Clock size={10} /> Recent orders
                  </p>
                  {recentCompletedOrders.map(o => (
                    <div key={o.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">{o.orderNumber}</span>
                      <span className="text-foreground truncate mx-2 flex-1">
                        {o.items.map(i => `${i.productName}×${i.quantity}`).join(", ")}
                      </span>
                      <span className="text-primary font-semibold shrink-0">{formatCurrency(o.totalAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Name & phone */}
          <input type="text" placeholder="Customer name *" value={customerName} onChange={e => setCustomerName(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          <input type="tel" placeholder="Mobile number" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        {/* Cart */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Tap menu items to add</p>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="bg-background rounded-lg px-3 py-2.5 border border-border space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} each</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => updateQty(idx, -1)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center">
                      <Minus size={10} />
                    </button>
                    <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                    <button onClick={() => updateQty(idx, 1)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center">
                      <Plus size={10} />
                    </button>
                    <button onClick={() => removeItem(idx)} className="w-6 h-6 rounded-md text-destructive/60 hover:text-destructive ml-1">
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <span className="text-sm font-bold text-primary shrink-0">{formatCurrency(item.price * item.quantity)}</span>
                </div>
                {/* Per-item type toggle — disabled for delivery orders */}
                {orderType !== "delivery" && (
                  <button onClick={() => toggleItemType(idx)}
                    className={cn("flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors",
                      item.itemOrderType === "takeaway"
                        ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                        : "bg-secondary text-muted-foreground border border-transparent hover:border-border")}>
                    {item.itemOrderType === "takeaway"
                      ? <><ShoppingBag size={10} /> Takeaway</>
                      : <><UtensilsCrossed size={10} /> Dine In</>}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-card-border shrink-0 space-y-3">
          <input type="text" placeholder="Special instructions (optional)" value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />

          {/* Offer selector */}
          {activeOffers.length > 0 && cart.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Tag size={11} /> Apply Offer
              </label>
              <select
                value={selectedOfferId ?? ""}
                onChange={e => setSelectedOfferId(e.target.value ? Number(e.target.value) : null)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">No offer</option>
                {activeOffers.map(o => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              {selectedOffer && offerDiscount > 0 && (
                <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1">
                  ✓ {selectedOffer.name} — saves {formatCurrency(offerDiscount)}
                </p>
              )}
              {selectedOffer && offerDiscount === 0 && (
                <p className="text-xs text-amber-400 mt-1">Offer conditions not met for current cart</p>
              )}
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1">
            {offerDiscount > 0 && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{cart.length} item{cart.length !== 1 ? "s" : ""} · Subtotal</span>
                  <span className="text-foreground">{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-emerald-400">Offer Discount</span>
                  <span className="text-emerald-400 font-semibold">−{formatCurrency(offerDiscount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/50 pt-1">
                  <span className="text-sm text-muted-foreground font-medium">Total</span>
                  <span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
                </div>
              </>
            )}
            {offerDiscount === 0 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{cart.length} item{cart.length !== 1 ? "s" : ""}</span>
                <span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
              </div>
            )}
          </div>

          {cart.some(i => i.itemOrderType === "takeaway") && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <ShoppingBag size={12} />
              <span>{cart.filter(i => i.itemOrderType === "takeaway").reduce((s, i) => s + i.quantity, 0)} item(s) need packaging</span>
            </div>
          )}
          <button onClick={placeOrder}
            disabled={!customerName.trim() || cart.length === 0 || createOrder.isPending}
            className="w-full py-3.5 rounded-xl text-base font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
            {createOrder.isPending ? "Placing..." : "Place Order →"}
          </button>
        </div>
      </div>

      {/* Payment modal */}
      {placedOrder && (
        <PaymentModal
          order={placedOrder}
          createPayment={createPayment}
          updateStatus={updateStatus}
          onClose={() => {
            setPlacedOrder(null);
            qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
            qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          }}
        />
      )}

      {addonOrderId !== null && (() => {
        const targetOrder = kitchenOrders.find(o => o.id === addonOrderId);
        if (!targetOrder) return null;
        return (
          <AddItemsModal
            order={targetOrder}
            categories={categories}
            allProducts={allProducts}
            onClose={() => setAddonOrderId(null)}
            onSuccess={() => {
              setAddonOrderId(null);
              qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
            }}
          />
        );
      })()}
    </div>
  );
}

type KitchenOrder = ListOrdersQueryResult[number];
type Product = ListProductsQueryResult[number];
type Category = ListCategoriesQueryResult[number];

function AddItemsModal({
  order, categories, allProducts, onClose, onSuccess,
}: {
  order: KitchenOrder;
  categories: Category[];
  allProducts: Product[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [addonCart, setAddonCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCat] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [orderType, setOrderType] = useState<ItemOrderType>(
    order.orderType === "takeaway" ? "takeaway" : "dine_in"
  );
  const [done, setDone] = useState(false);
  const addAddonItems = useAddAddonItems();

  const addToCart = (p: Product) => {
    setAddonCart(prev => {
      const existing = prev.find(c => c.productId === p.id && c.itemOrderType === orderType);
      if (existing) return prev.map(c =>
        c.productId === p.id && c.itemOrderType === orderType ? { ...c, quantity: c.quantity + 1 } : c
      );
      return [...prev, { productId: p.id, productName: p.name, price: Number(p.price), quantity: 1, itemOrderType: orderType }];
    });
  };

  const removeFromCart = (productId: number | null, iot: string) => {
    setAddonCart(prev => prev.filter(c => !(c.productId === productId && c.itemOrderType === iot)));
  };

  const cartTotal = addonCart.reduce((s, c) => s + c.price * c.quantity, 0);
  const cartCount = addonCart.reduce((s, c) => s + c.quantity, 0);

  const filteredProducts = allProducts.filter(p => {
    const matchesCat = !activeCategory || p.categoryId === activeCategory;
    const catActive = p.categoryId == null || categories.some(c => c.id === p.categoryId && c.active);
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
        onSuccess: () => { setDone(true); setTimeout(onSuccess, 1200); },
      }
    );
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-xl font-bold text-foreground">Sent to Kitchen!</p>
          <p className="text-muted-foreground text-sm mt-1">{order.orderNumber} — add-on items queued</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs font-bold text-orange-400 bg-orange-500/15 border border-orange-400/30 px-2 py-0.5 rounded-full">＋ ADD-ON</span>
                <span className="text-xs font-mono text-muted-foreground">{order.orderNumber}</span>
              </div>
              <h2 className="text-base font-bold text-foreground">{order.customerName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Current total: <span className="text-primary font-bold">{formatCurrency(order.totalAmount)}</span>
                {cartTotal > 0 && <span className="text-foreground"> → {formatCurrency(order.totalAmount + cartTotal)}</span>}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 -mr-1 -mt-1">
              <X size={18} />
            </button>
          </div>
          {/* Order type tabs */}
          <div className="flex gap-2 mt-3">
            {(["dine_in", "takeaway"] as ItemOrderType[]).map(t => (
              <button key={t} onClick={() => setOrderType(t)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                  orderType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-transparent hover:border-border")}>
                {ORDER_TYPE_LABELS[t]}
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
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button onClick={() => setActiveCat(null)}
                  className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    !activeCategory ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                  All
                </button>
                {categories.filter(c => c.active).map(c => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)}
                    className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground")}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {filteredProducts.map(p => {
                  const inCart = addonCart.find(c => c.productId === p.id && c.itemOrderType === orderType);
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className={cn("relative rounded-xl p-3 text-left border transition-all active:scale-95",
                        inCart ? "bg-primary/15 border-primary/50" : "bg-secondary border-transparent hover:border-primary/30")}>
                      {inCart && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground text-xs font-bold">{inCart.quantity}</span>
                        </div>
                      )}
                      <p className="font-semibold text-sm text-foreground leading-tight">{p.name}</p>
                      <p className="text-primary font-bold text-sm mt-1">{formatCurrency(Number(p.price))}</p>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="col-span-3 text-center text-sm text-muted-foreground py-8">No products found</p>
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
                      <p className="text-xs font-medium text-foreground leading-tight">{c.productName}</p>
                      <p className="text-xs text-muted-foreground">×{c.quantity} · {formatCurrency(c.price * c.quantity)}</p>
                    </div>
                    <button onClick={() => removeFromCart(c.productId, c.itemOrderType)}
                      className="text-muted-foreground hover:text-foreground shrink-0 mt-0.5">
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
                  <span className="font-bold text-foreground">{formatCurrency(order.totalAmount + cartTotal)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border shrink-0">
          <button onClick={handleSubmit}
            disabled={addonCart.length === 0 || addAddonItems.isPending}
            className="w-full py-3 rounded-xl text-sm font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
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

function PaymentModal({
  order, createPayment, updateStatus, onClose,
}: {
  order: PlacedOrder;
  createPayment: ReturnType<typeof useCreateOrderPayment>;
  updateStatus: ReturnType<typeof useUpdateOrderStatus>;
  onClose: () => void;
}) {
  const [cash, setCash] = useState("");
  const [upi, setUpi] = useState("");
  const [card, setCard] = useState("");
  const [isCharity, setIsCharity] = useState(false);
  const [done, setDone] = useState(false);
  const [doneLabel, setDoneLabel] = useState("");

  const cashAmt = parseFloat(cash) || 0;
  const upiAmt = parseFloat(upi) || 0;
  const cardAmt = parseFloat(card) || 0;
  const totalPaid = isCharity ? order.totalAmount : cashAmt + upiAmt + cardAmt;
  const balance = order.totalAmount - totalPaid;
  const canPayNow = isCharity || totalPaid > 0;
  const takeawayItems = order.items.filter(i => i.itemOrderType === "takeaway");
  const packagingCount = takeawayItems.reduce((s, i) => s + i.quantity, 0);

  const handlePayNow = () => {
    if (isCharity) {
      // Charity: mark completed directly
      updateStatus.mutate({ id: order.id, data: { status: "completed" } }, {
        onSuccess: () => { setDoneLabel("Charity — Completed!"); setDone(true); setTimeout(onClose, 1500); },
      });
      return;
    }
    const payload = { totalAmount: order.totalAmount, cashAmount: cashAmt, upiAmount: upiAmt, cardAmount: cardAmt };
    createPayment.mutate({ id: order.id, data: payload }, {
      onSuccess: () => {
        // Backend auto-approves; show confirmation
        setDoneLabel(balance <= 0 ? "Paid & Sent to Kitchen!" : "Partial Payment Saved!");
        setDone(true);
        setTimeout(onClose, 1500);
      },
    });
  };

  const handleSendToKitchen = () => {
    // Approve without payment — kitchen can proceed
    updateStatus.mutate({ id: order.id, data: { status: "approved" } }, {
      onSuccess: () => { setDoneLabel("Sent to Kitchen!"); setDone(true); setTimeout(onClose, 1200); },
    });
  };

  const handleSetFull = (method: "cash" | "upi") => {
    if (method === "cash") { setCash(String(order.totalAmount)); setUpi(""); setCard(""); }
    else { setUpi(String(order.totalAmount)); setCash(""); setCard(""); }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-xl font-bold text-foreground">{doneLabel}</p>
          <p className="text-muted-foreground text-sm mt-1">{order.orderNumber}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-0.5">
            <h2 className="text-lg font-bold text-foreground">{order.orderNumber}</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X size={18} /></button>
          </div>
          <p className="text-sm text-muted-foreground">{order.customerName} · {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</p>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[72vh] overflow-y-auto">
          {/* Item list */}
          <div className="space-y-1.5">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-sm text-foreground truncate">{item.productName} ×{item.quantity}</span>
                  {item.itemOrderType === "takeaway"
                    ? <span className="shrink-0 text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded font-medium flex items-center gap-1"><ShoppingBag size={9} /> Pack</span>
                    : <span className="shrink-0 text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded font-medium flex items-center gap-1"><UtensilsCrossed size={9} /> Dine</span>
                  }
                </div>
                <span className="text-sm font-semibold text-primary shrink-0">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>

          {packagingCount > 0 && (
            <div className="flex items-center gap-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <ShoppingBag size={12} />
              <span>{packagingCount} item(s) need packing</span>
            </div>
          )}

          <div className="border-t border-border pt-3 flex justify-between items-center">
            <span className="font-semibold text-foreground">Total</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(order.totalAmount)}</span>
          </div>

          {/* Charity toggle */}
          <button onClick={() => setIsCharity(v => !v)}
            className={cn("w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border transition-colors",
              isCharity ? "bg-purple-500/20 border-purple-500/50 text-purple-400" : "bg-secondary border-border text-muted-foreground hover:text-foreground")}>
            <Heart size={14} />
            {isCharity ? "Charity — No Payment Needed" : "Mark as Charity"}
          </button>

          {!isCharity && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Split Payment</p>
              <div className="space-y-2">
                <div className="relative">
                  <Banknote size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="number" placeholder="Cash" value={cash} onChange={e => setCash(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg pl-8 pr-16 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  <button onClick={() => handleSetFull("cash")} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary font-semibold px-1.5">Full</button>
                </div>
                <div className="relative">
                  <Smartphone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="number" placeholder="UPI / QR" value={upi} onChange={e => setUpi(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg pl-8 pr-16 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                  <button onClick={() => handleSetFull("upi")} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary font-semibold px-1.5">Full</button>
                </div>
                <div className="relative">
                  <CreditCard size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="number" placeholder="Card" value={card} onChange={e => setCard(e.target.value)}
                    className="w-full bg-background border border-input rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>

              {/* Payment summary */}
              <div className="bg-secondary rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold text-foreground">{formatCurrency(order.totalAmount)}</span>
                </div>
                {totalPaid > 0 && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount Paid</span>
                      <span className="font-semibold text-green-400">{formatCurrency(totalPaid)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold border-t border-border/50 pt-2">
                      <span className={balance > 0 ? "text-amber-400" : "text-green-400"}>
                        {balance > 0 ? "Pending Amount" : "✓ Fully Paid"}
                      </span>
                      <span className={balance > 0 ? "text-amber-400" : "text-green-400"}>
                        {balance > 0 ? formatCurrency(balance) : formatCurrency(totalPaid)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSendToKitchen} disabled={updateStatus.isPending}
              className="flex-1 py-3 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50">
              {updateStatus.isPending ? "..." : "Send to Kitchen"}
            </button>
            <button onClick={handlePayNow} disabled={(!canPayNow && !isCharity) || createPayment.isPending || updateStatus.isPending}
              className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 transition-all">
              {createPayment.isPending ? "..." : isCharity ? "Confirm Charity" : "Pay & Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
