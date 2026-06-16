import {
  useGetDashboard, useListOrders, useUpdateOrderStatus, useAddOrderItem, useListProducts,
  getGetDashboardQueryKey, getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatTime, STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import {
  RefreshCw, TrendingUp, ChefHat, Clock, CheckCircle,
  Search, Trash2, X, AlertTriangle, Plus, Minus, Phone, ShoppingBag,
} from "lucide-react";
import { useState } from "react";

const statusClass: Record<string, string> = {
  pending_payment: "status-pending_payment",
  approved:   "status-approved",
  preparing:  "status-preparing",
  ready:      "status-ready",
  completed:  "status-completed",
  cancelled:  "status-cancelled",
};

const ACTIVE_STATUSES = new Set(["pending_payment", "approved", "preparing", "ready"]);

type ConfirmState = { orderId: number; orderNumber: string; customerName: string } | null;
type AddItemsState = { orderId: number; orderNumber: string; customerName: string } | null;

function PaymentBadge({ payment, totalAmount }: {
  payment: { status: string; totalPaid?: number; balance?: number } | null | undefined;
  totalAmount: number;
}) {
  if (!payment) return (
    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-red-500/20 text-red-400 border border-red-500/30 whitespace-nowrap">
      UNPAID ₹{totalAmount}
    </span>
  );
  if (payment.status === "paid") return (
    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-green-500/15 text-green-400 border border-green-500/25 whitespace-nowrap">
      ✓ PAID
    </span>
  );
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25 whitespace-nowrap">
      ₹{payment.balance?.toFixed(0)} DUE
    </span>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetDashboard({ query: { refetchInterval: 3000, queryKey: getGetDashboardQueryKey() } });
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [addItems, setAddItems] = useState<AddItemsState>(null);

  const { data: searchResults } = useListOrders(
    { search },
    { query: { enabled: search.length > 0, refetchInterval: 3000, queryKey: getListOrdersQueryKey({ search }) } }
  );

  const updateStatus = useUpdateOrderStatus();

  const handleCancelConfirmed = () => {
    if (!confirm) return;
    updateStatus.mutate({ id: confirm.orderId, data: { status: "cancelled" } }, {
      onSuccess: () => {
        setConfirm(null);
        qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
        qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      },
    });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><RefreshCw className="animate-spin text-primary" size={32} /></div>;
  }

  const summary = data;
  const displayOrders = search.length > 0 ? (searchResults ?? []) : (summary?.recentOrders ?? []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live order overview</p>
        </div>
        <button onClick={() => qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() })}
          className="p-2 rounded-lg bg-secondary hover:bg-muted text-muted-foreground">
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stat cards — 2 rows */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Pending Payment" value={summary?.pendingCount ?? 0}   color="text-orange-400"  bgColor="bg-orange-500/10"  icon={<Clock      size={18} className="text-orange-400" />} />
        <StatCard label="Approved"        value={summary?.approvedCount ?? 0}  color="text-violet-400" bgColor="bg-violet-500/10" icon={<ShoppingBag size={18} className="text-violet-400" />} />
        <StatCard label="Preparing"       value={summary?.preparingCount ?? 0} color="text-blue-400"   bgColor="bg-blue-500/10"   icon={<ChefHat    size={18} className="text-blue-400" />} />
        <StatCard label="Ready"           value={summary?.readyCount ?? 0}     color="text-green-400"  bgColor="bg-green-500/10"  icon={<CheckCircle size={18} className="text-green-400" />} />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="col-span-1 md:col-span-2 bg-card border border-card-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Today's Revenue</p>
          <p className="text-3xl font-bold text-primary">{formatCurrency(summary?.todayRevenue ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {summary?.completedToday ?? 0} completed · {summary?.todayOrders ?? 0} total orders
          </p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Expenses</p>
            <p className="text-2xl font-bold text-destructive">{formatCurrency(summary?.todayExpenses ?? 0)}</p>
            <p className="text-xs text-muted-foreground mt-1">Today</p>
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            <p className="text-xs text-muted-foreground">Est. Profit</p>
            <p className={cn("text-lg font-bold", (summary?.todayRevenue ?? 0) - (summary?.todayExpenses ?? 0) >= 0 ? "text-emerald-400" : "text-destructive")}>
              {formatCurrency((summary?.todayRevenue ?? 0) - (summary?.todayExpenses ?? 0))}
            </p>
          </div>
        </div>
      </div>

      {/* Orders table */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold flex-1">Recent Orders</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)}
              className="bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-48" />
          </div>
        </div>

        <div className="space-y-2">
          {displayOrders.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No orders yet today</div>
          )}
          {displayOrders.slice(0, 25).map(order => {
            const isActive = ACTIVE_STATUSES.has(order.status);
            const isUnpaid = !order.payment;
            const isPartial = order.payment?.status === "partial";
            return (
              <div key={order.id}
                className={cn("bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-3",
                  isUnpaid && isActive && "border-red-500/30 bg-red-500/5")}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusClass[order.status])}>
                      {STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="text-xs text-muted-foreground">{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</span>
                    <PaymentBadge payment={order.payment} totalAmount={order.totalAmount} />
                  </div>
                  <p className="font-semibold text-sm mt-0.5">{order.customerName}</p>
                  {order.customerPhone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Phone size={10} /> {order.customerPhone}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.items.map(i => `${i.productName}${i.itemOrderType === "takeaway" ? " [Pack]" : ""} ×${i.quantity}`).join(", ")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold text-sm text-primary">{formatCurrency(order.totalAmount)}</p>
                  <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
                </div>
                {isActive && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setAddItems({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
                      className="p-1.5 rounded-lg bg-secondary hover:bg-primary/20 text-muted-foreground hover:text-primary transition-colors"
                      title="Add items">
                      <Plus size={14} />
                    </button>
                    <Link href={`/billing/${order.id}`}
                      className={cn("text-xs px-3 py-1.5 rounded-lg font-bold hover:opacity-90 transition-all",
                        isUnpaid || isPartial ? "bg-red-500 text-white" : "bg-primary text-primary-foreground")}>
                      {isUnpaid ? "Collect" : isPartial ? "Partial" : "Bill"}
                    </Link>
                    <button
                      onClick={() => setConfirm({ orderId: order.id, orderNumber: order.orderNumber, customerName: order.customerName })}
                      className="p-1.5 rounded-lg bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancel modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Cancel this order?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-mono text-xs">{confirm.orderNumber}</span> — {confirm.customerName}
                </p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5">
                <X size={14} /> Keep
              </button>
              <button onClick={handleCancelConfirmed} disabled={updateStatus.isPending}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5">
                <Trash2 size={14} /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {addItems && (
        <AddItemsModal
          orderId={addItems.orderId}
          orderNumber={addItems.orderNumber}
          customerName={addItems.customerName}
          onClose={() => {
            setAddItems(null);
            qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
            qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          }}
        />
      )}
    </div>
  );
}

function AddItemsModal({ orderId, orderNumber, customerName, onClose }: {
  orderId: number; orderNumber: string; customerName: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<{ productId: number | null; productName: string; price: number; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const { data: allProducts = [] } = useListProducts({ active: true });
  const addOrderItem = useAddOrderItem();

  const categoryMap = new Map<number, string>();
  for (const p of allProducts) { if (p.categoryId && p.categoryName) categoryMap.set(p.categoryId, p.categoryName); }
  const categories = Array.from(categoryMap.entries()).map(([id, name]) => ({ id, name }));

  const products = allProducts.filter(p => {
    const matchesCat = activeCategory == null || p.categoryId === activeCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (p: typeof allProducts[number]) => {
    setCart(prev => {
      const idx = prev.findIndex(c => c.productId === p.id);
      if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, quantity: c.quantity + 1 } : c);
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

  const handleAdd = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    for (const item of cart) {
      await new Promise<void>(resolve => {
        addOrderItem.mutate({
          id: orderId,
          data: { productId: item.productId, productName: item.productName, price: item.price, quantity: item.quantity },
        }, { onSettled: () => resolve() });
      });
    }
    setSaving(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    setTimeout(onClose, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-foreground">Add Items</h2>
            <p className="text-xs text-muted-foreground mt-0.5"><span className="font-mono">{orderNumber}</span> — {customerName}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1"><X size={18} /></button>
        </div>
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
            <div className="p-3 space-y-2 shrink-0">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                <button onClick={() => setActiveCategory(null)}
                  className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium",
                    activeCategory == null ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>All</button>
                {categories.map(c => (
                  <button key={c.id} onClick={() => setActiveCategory(c.id)}
                    className={cn("shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium",
                      activeCategory === c.id ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 grid grid-cols-2 gap-2 content-start">
              {products.map(p => {
                const inCart = cart.find(c => c.productId === p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className={cn("relative rounded-xl p-3 text-left border transition-all active:scale-95",
                      inCart ? "bg-primary/15 border-primary/50" : "bg-secondary border-transparent hover:border-primary/30")}>
                    {inCart && (
                      <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground text-xs font-bold">{inCart.quantity}</span>
                      </div>
                    )}
                    <p className="font-semibold text-xs text-foreground leading-tight mb-0.5 pr-4">{p.name}</p>
                    <p className="text-primary font-bold text-sm">₹{p.price}</p>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="w-52 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-border shrink-0">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adding</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center pt-4">Tap items to add</p>
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="bg-secondary rounded-lg px-2.5 py-2">
                    <p className="text-xs font-medium text-foreground leading-tight truncate mb-1">{item.productName}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateQty(idx, -1)} className="w-5 h-5 rounded bg-background flex items-center justify-center"><Minus size={8} /></button>
                        <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
                        <button onClick={() => updateQty(idx, 1)} className="w-5 h-5 rounded bg-background flex items-center justify-center"><Plus size={8} /></button>
                      </div>
                      <span className="text-xs font-bold text-primary">₹{item.price * item.quantity}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="p-3 border-t border-border space-y-2 shrink-0">
              {cart.length > 0 && (
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-muted-foreground">+Total</span>
                  <span className="text-primary">₹{cart.reduce((s, i) => s + i.price * i.quantity, 0)}</span>
                </div>
              )}
              <button onClick={handleAdd} disabled={cart.length === 0 || saving || done}
                className={cn("w-full py-2.5 rounded-xl text-sm font-bold transition-all",
                  done ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed")}>
                {done ? "✓ Added!" : saving ? "Adding..." : `Add ${cart.reduce((s, i) => s + i.quantity, 0)} item${cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color, bgColor, icon }: {
  label: string; value: number; color: string; bgColor: string; icon: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl p-4 border border-card-border", bgColor)}>
      <div className="flex items-center justify-between mb-2">{icon}</div>
      <p className={cn("text-3xl font-bold", color)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
