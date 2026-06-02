import { useState } from "react";
import {
  useListCategories,
  useListProducts,
  useCreateOrder,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, Minus, Trash2, ShoppingCart, Check, Search } from "lucide-react";
import { useLocation } from "wouter";

type CartItem = {
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
};

const ORDER_TYPES = ["dine_in", "takeaway", "delivery"] as const;

export default function Counter() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState(false);

  const { data: categories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });
  const createOrder = useCreateOrder();

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
        setSuccess(true);
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setNotes("");
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        setTimeout(() => setSuccess(false), 2000);
      },
    });
  };

  return (
    <div className="flex h-full overflow-hidden flex-col md:flex-row">
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Search + category tabs */}
        <div className="px-4 pt-4 pb-2 space-y-3 shrink-0">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">Order Taking</h1>
          </div>
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

        {/* Product grid */}
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
                        : "bg-card border-card-border hover:border-primary/30 hover:bg-card"
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
          {/* Order type */}
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

        {/* Cart items */}
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

        {/* Footer: total + place order */}
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
            className={cn(
              "w-full py-3.5 rounded-xl text-base font-bold transition-all",
              success
                ? "bg-green-600 text-white"
                : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {success ? (
              <span className="flex items-center justify-center gap-2"><Check size={18} /> Order Placed!</span>
            ) : createOrder.isPending ? "Placing..." : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}
