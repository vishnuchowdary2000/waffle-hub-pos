import { useState } from "react";
import {
  useListCategories,
  useListProducts,
  useCreateOrder,
  useCreateOrderPayment,
  useUpdateOrderStatus,
  getListOrdersQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Plus, Minus, Trash2, ShoppingCart, Search,
  Banknote, Smartphone, CreditCard, Heart,
  Clock, CheckCircle, X, ChevronRight,
} from "lucide-react";

type CartItem = {
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
};

type PlacedOrder = {
  id: number;
  orderNumber: string;
  customerName: string;
  orderType: string;
  totalAmount: number;
  items: { productName: string; quantity: number; price: number }[];
};

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;

export default function Counter() {
  const qc = useQueryClient();

  // Order form state
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Post-order payment modal
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);

  const { data: categories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });
  const createOrder = useCreateOrder();
  const createPayment = useCreateOrderPayment();
  const updateStatus = useUpdateOrderStatus();

  const products = allProducts.filter(p => {
    const matchesCat = activeCategory == null || p.categoryId === activeCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (p: typeof allProducts[number]) => {
    setCart(prev => {
      const existing = prev.findIndex(c => c.productId === p.id);
      if (existing >= 0) {
        return prev.map((c, i) => i === existing ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { productId: p.id, productName: p.name, price: p.price, quantity: 1 }];
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

  const removeItem = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);

  const resetForm = () => {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setNotes("");
  };

  const placeOrder = () => {
    if (!customerName.trim() || cart.length === 0) return;
    createOrder.mutate({
      data: {
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
        orderType,
        notes: notes.trim() || undefined,
        items: cart.map(c => ({
          productId: c.productId,
          productName: c.productName,
          price: c.price,
          quantity: c.quantity,
        })),
      },
    }, {
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

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
          <h1 className="text-xl font-bold text-foreground">Order Taking</h1>
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
              className={cn(
                "shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                activeCategory == null ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              All
            </button>
            {categories.filter(c => c.active).map(c => (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                className={cn(
                  "shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {c.name}
              </button>
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
                  <button
                    key={p.id}
                    onClick={() => addToCart(p)}
                    className={cn(
                      "relative rounded-xl p-4 text-left border transition-all active:scale-95",
                      inCart
                        ? "bg-primary/15 border-primary/50 shadow-md"
                        : "bg-card border-card-border hover:border-primary/30"
                    )}
                  >
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

      {/* Right: Order form + cart */}
      <div className="md:w-80 lg:w-96 bg-card border-t md:border-t-0 md:border-l border-card-border flex flex-col max-h-80 md:max-h-none">
        <div className="p-4 border-b border-card-border space-y-3 shrink-0">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" /> New Order
          </h2>
          <div className="grid grid-cols-3 gap-1.5">
            {ORDER_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={cn(
                  "py-2 rounded-lg text-xs font-semibold transition-colors border",
                  orderType === t
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                )}
              >
                {ORDER_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Customer name *"
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="tel"
            placeholder="Mobile number"
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {cart.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Tap menu items to add</p>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2.5 border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(item.price)} each</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => updateQty(idx, -1)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center">
                    <Minus size={10} className="text-foreground" />
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <button onClick={() => updateQty(idx, 1)} className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center">
                    <Plus size={10} className="text-foreground" />
                  </button>
                  <button onClick={() => removeItem(idx)} className="w-6 h-6 rounded-md text-destructive/60 hover:text-destructive ml-1">
                    <Trash2 size={12} />
                  </button>
                </div>
                <span className="text-sm font-bold text-primary shrink-0">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))
          )}
        </div>

        <div className="p-4 border-t border-card-border shrink-0 space-y-3">
          <input
            type="text"
            placeholder="Special instructions (optional)"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{cart.length} items</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(total)}</span>
          </div>
          <button
            onClick={placeOrder}
            disabled={!customerName.trim() || cart.length === 0 || createOrder.isPending}
            className="w-full py-3.5 rounded-xl text-base font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
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
    </div>
  );
}

function PaymentModal({
  order,
  createPayment,
  updateStatus,
  onClose,
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

  const cashAmt = parseFloat(cash) || 0;
  const upiAmt = parseFloat(upi) || 0;
  const cardAmt = parseFloat(card) || 0;
  const totalPaid = isCharity ? order.totalAmount : cashAmt + upiAmt + cardAmt;
  const balance = order.totalAmount - totalPaid;
  const canPayNow = isCharity || totalPaid > 0;

  const handlePayNow = () => {
    const payload = isCharity
      ? { totalAmount: order.totalAmount, cashAmount: 0, upiAmount: 0, cardAmount: 0 }
      : { totalAmount: order.totalAmount, cashAmount: cashAmt, upiAmount: upiAmt, cardAmount: cardAmt };

    createPayment.mutate({ id: order.id, data: payload }, {
      onSuccess: () => {
        if (isCharity) {
          updateStatus.mutate({ id: order.id, data: { status: "completed" } }, {
            onSuccess: () => { setDone(true); setTimeout(onClose, 1500); },
          });
        } else {
          setDone(true);
          setTimeout(onClose, 1500);
        }
      },
    });
  };

  const handlePayLater = () => {
    onClose();
  };

  const handleSetFull = (method: "cash" | "upi") => {
    if (method === "cash") { setCash(String(order.totalAmount)); setUpi(""); setCard(""); }
    else { setUpi(String(order.totalAmount)); setCash(""); setCard(""); }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-card border border-card-border rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle size={32} className="text-green-400" />
          </div>
          <p className="text-lg font-bold text-foreground">
            {isCharity ? "Charity Order ❤️" : "Payment Done!"}
          </p>
          <p className="text-sm text-muted-foreground">Order {order.orderNumber}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border flex items-start justify-between shrink-0">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
            <h2 className="text-lg font-bold text-foreground mt-0.5">{order.customerName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-medium capitalize">
                {ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}
              </span>
              <span className="text-xs text-muted-foreground">Order placed ✓</span>
            </div>
          </div>
          <button onClick={handlePayLater} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>

        {/* Order items summary */}
        <div className="px-5 py-3 bg-secondary/30 border-b border-border shrink-0">
          <div className="space-y-1">
            {order.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{item.productName} <span className="text-muted-foreground">x{item.quantity}</span></span>
                <span className="font-medium text-foreground">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
            <span className="font-bold text-sm text-foreground">Total</span>
            <span className="text-xl font-bold text-primary">{formatCurrency(order.totalAmount)}</span>
          </div>
        </div>

        {/* Scrollable payment body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Charity toggle */}
          <button
            onClick={() => setIsCharity(!isCharity)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all",
              isCharity
                ? "bg-pink-500/15 border-pink-500/50 text-pink-400"
                : "bg-secondary border-transparent text-muted-foreground hover:border-border"
            )}
          >
            <Heart size={18} className={isCharity ? "fill-pink-400 text-pink-400" : ""} />
            <div className="text-left flex-1">
              <p className="font-semibold text-sm">Charity / Free Order</p>
              <p className="text-xs opacity-70">Mark as given free — no payment needed</p>
            </div>
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0",
              isCharity ? "bg-pink-500 border-pink-500" : "border-muted-foreground"
            )}>
              {isCharity && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
            </div>
          </button>

          {/* Payment fields — hidden when charity */}
          {!isCharity && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment Method</p>

              <PayField
                icon={<Banknote size={16} className="text-emerald-400" />}
                label="Cash"
                color="text-emerald-400"
                value={cash}
                onChange={setCash}
                onSetFull={() => handleSetFull("cash")}
              />
              <PayField
                icon={<Smartphone size={16} className="text-blue-400" />}
                label="UPI / QR"
                color="text-blue-400"
                value={upi}
                onChange={setUpi}
                onSetFull={() => handleSetFull("upi")}
              />
              <PayField
                icon={<CreditCard size={16} className="text-purple-400" />}
                label="Card"
                color="text-purple-400"
                value={card}
                onChange={setCard}
              />

              {(cashAmt + upiAmt + cardAmt) > 0 && (
                <div className={cn(
                  "flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold",
                  balance <= 0 ? "bg-green-500/10 text-green-400" : "bg-amber-500/10 text-amber-400"
                )}>
                  <span>{balance <= 0 ? "Change to Return" : "Balance Due"}</span>
                  <span className="text-lg">{formatCurrency(Math.abs(balance))}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 pt-3 border-t border-border space-y-2 shrink-0">
          <button
            onClick={handlePayNow}
            disabled={!canPayNow || createPayment.isPending || updateStatus.isPending}
            className={cn(
              "w-full py-4 rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2",
              isCharity
                ? "bg-pink-600 hover:bg-pink-500 text-white disabled:opacity-50"
                : "bg-primary hover:opacity-90 text-primary-foreground disabled:opacity-40",
              "disabled:cursor-not-allowed"
            )}
          >
            {isCharity ? (
              <><Heart size={18} className="fill-white" /> Mark as Charity</>
            ) : (
              <><CheckCircle size={18} /> Pay Now — {formatCurrency(order.totalAmount)}</>
            )}
          </button>

          <button
            onClick={handlePayLater}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center gap-2 transition-colors"
          >
            <Clock size={15} /> Send to Kitchen — Pay Later
          </button>
        </div>
      </div>
    </div>
  );
}

function PayField({
  icon, label, color, value, onChange, onSetFull,
}: {
  icon: React.ReactNode; label: string; color: string;
  value: string; onChange: (v: string) => void; onSetFull?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex items-center gap-2 w-28 shrink-0", color)}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="relative flex-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
        <input
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-background border border-input rounded-lg pl-7 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {onSetFull && (
        <button
          onClick={onSetFull}
          className="shrink-0 text-xs px-3 py-2.5 bg-secondary text-muted-foreground hover:text-foreground rounded-lg font-medium"
        >
          Full
        </button>
      )}
    </div>
  );
}
