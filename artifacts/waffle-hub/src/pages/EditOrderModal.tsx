import { useState } from "react";
import {
  useListCategories,
  useListProducts,
  useSmartEditOrder,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  X,
  Plus,
  Minus,
  Trash2,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  Pencil,
  Lock,
  UserRound,
  CheckCircle,
} from "lucide-react";

type ItemOrderType = "dine_in" | "takeaway";

type CartItem = {
  id?: number;
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: ItemOrderType;
  locked: boolean;
};

type OrderForEdit = {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  notes?: string | null;
  customerName: string;
  customerPhone?: string | null;
  items: {
    id: number;
    productId?: number | null;
    productName: string;
    price: number;
    quantity: number;
    itemOrderType: string;
  }[];
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending_payment: { label: "Pending Payment",  color: "text-amber-400" },
  approved:        { label: "In Kitchen",        color: "text-violet-400" },
  preparing:       { label: "Preparing",         color: "text-blue-400" },
  ready:           { label: "Ready",             color: "text-green-400" },
};

export default function EditOrderModal({
  order,
  onClose,
}: {
  order: OrderForEdit;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  // Items in approved state can be removed/qty-changed; preparing/ready are locked
  const canModifyExisting = order.status === "pending_payment" || order.status === "approved";

  const [cart, setCart] = useState<CartItem[]>(() =>
    order.items.map(i => ({
      id: i.id,
      productId: i.productId ?? null,
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      itemOrderType: i.itemOrderType === "takeaway" ? "takeaway" : "dine_in",
      locked: !canModifyExisting,
    }))
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const [customerName, setCustomerName] = useState(order.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState(order.customerPhone ?? "");
  const [defaultItemType, setDefaultItemType] = useState<ItemOrderType>("dine_in");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saved, setSaved] = useState(false);

  const { data: categories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });
  const smartEdit = useSmartEditOrder();

  const products = allProducts.filter(p => {
    const matchesCat = activeCategory == null || p.categoryId === activeCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (p: (typeof allProducts)[number]) => {
    setCart(prev => {
      const existing = prev.findIndex(
        c => c.productId === p.id && c.itemOrderType === defaultItemType && !c.id
      );
      if (existing >= 0) {
        return prev.map((c, i) =>
          i === existing ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        {
          productId: p.id,
          productName: p.name,
          price: p.price,
          quantity: 1,
          itemOrderType: defaultItemType,
          locked: false,
        },
      ];
    });
  };

  const updateQty = (idx: number, delta: number) => {
    if (cart[idx]?.locked) return;
    setCart(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + delta };
      if (updated[idx].quantity <= 0) updated.splice(idx, 1);
      return updated;
    });
  };

  const toggleItemType = (idx: number) => {
    if (cart[idx]?.locked) return;
    setCart(prev => {
      const item = prev[idx];
      const newType: ItemOrderType =
        item.itemOrderType === "dine_in" ? "takeaway" : "dine_in";
      const mergeIdx = prev.findIndex(
        (c, i) =>
          i !== idx && c.productId === item.productId && c.itemOrderType === newType && !c.id
      );
      if (mergeIdx >= 0) {
        return prev
          .map((c, i) =>
            i === mergeIdx ? { ...c, quantity: c.quantity + item.quantity } : c
          )
          .filter((_, i) => i !== idx);
      }
      return prev.map((c, i) =>
        i === idx ? { ...c, itemOrderType: newType } : c
      );
    });
  };

  const removeItem = (idx: number) => {
    if (cart[idx]?.locked) return;
    setCart(prev => prev.filter((_, i) => i !== idx));
  };

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const packagingCount = cart
    .filter(i => i.itemOrderType === "takeaway")
    .reduce((s, i) => s + i.quantity, 0);
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const newItemCount = cart.filter(i => !i.id).length;
  const isKitchenOrder = !["pending_payment"].includes(order.status);

  const handleSave = () => {
    if (cart.length === 0) {
      setErrorMsg("Add at least one item before saving.");
      return;
    }
    setErrorMsg("");
    smartEdit.mutate(
      {
        id: order.id,
        data: {
          notes: notes.trim() || null,
          customerName: customerName.trim() || order.customerName,
          customerPhone: customerPhone.trim() || null,
          items: cart.map(c => ({
            id: c.id ?? null,
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
          void qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          setSaved(true);
          setTimeout(onClose, 1000);
        },
        onError: () => {
          setErrorMsg("Failed to save. Please try again.");
        },
      }
    );
  };

  const statusMeta = STATUS_META[order.status];

  if (saved) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-card border border-card-border rounded-2xl p-8 text-center shadow-2xl">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-3" />
          <p className="text-xl font-bold text-foreground">
            {newItemCount > 0 && isKitchenOrder ? "Sent to Kitchen!" : "Order Updated!"}
          </p>
          <p className="text-muted-foreground text-sm mt-1">{order.orderNumber}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-card border border-card-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
            <Pencil size={15} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base text-foreground leading-tight">
              Edit Order · {order.orderNumber}
            </h2>
            {statusMeta && (
              <p className={cn("text-xs font-medium", statusMeta.color)}>
                {statusMeta.label}
                {!canModifyExisting && (
                  <span className="text-muted-foreground ml-1.5">— existing items locked, you can add new ones</span>
                )}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Customer details */}
          <div className="px-4 pt-4 pb-2 space-y-2">
            <div className="flex items-center gap-2">
              <UserRound size={13} className="text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Customer name"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <input
                type="text"
                placeholder="Phone (optional)"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Current cart items */}
          <div className="px-4 py-2 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Items in order
            </p>
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 bg-secondary/40 rounded-xl">
                No items — add from the menu below
              </p>
            ) : (
              cart.map((item, idx) => (
                <div
                  key={`${item.id ?? "new"}-${idx}`}
                  className={cn(
                    "bg-background rounded-lg px-3 py-2.5 border space-y-1.5",
                    item.locked ? "border-border/40 opacity-70" : "border-border",
                    !item.id && "border-primary/30 bg-primary/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground truncate">
                          {item.productName}
                        </p>
                        {!item.id && (
                          <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-semibold shrink-0">NEW</span>
                        )}
                        {item.locked && (
                          <Lock size={11} className="text-muted-foreground shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!item.locked && (
                        <button
                          onClick={() => updateQty(idx, -1)}
                          className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"
                        >
                          <Minus size={10} />
                        </button>
                      )}
                      <span className="w-6 text-center text-sm font-bold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(idx, 1)}
                        disabled={item.locked}
                        className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Plus size={10} />
                      </button>
                      {!item.locked && (
                        <button
                          onClick={() => removeItem(idx)}
                          className="w-6 h-6 rounded-md text-destructive/60 hover:text-destructive ml-1"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                  {order.orderType !== "delivery" && !item.locked && (
                    <button
                      onClick={() => toggleItemType(idx)}
                      className={cn(
                        "flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md transition-colors",
                        item.itemOrderType === "takeaway"
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : "bg-secondary text-muted-foreground border border-transparent hover:border-border"
                      )}
                    >
                      {item.itemOrderType === "takeaway" ? (
                        <><ShoppingBag size={10} /> Takeaway</>
                      ) : (
                        <><UtensilsCrossed size={10} /> Dine In</>
                      )}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add items section */}
          <div className="px-4 pt-2 pb-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Add items{isKitchenOrder && " (add-on)"}
              </p>
              {order.orderType !== "delivery" && (
                <div className="flex gap-1">
                  {(["dine_in", "takeaway"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setDefaultItemType(t)}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors border",
                        defaultItemType === t
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-secondary text-muted-foreground border-transparent hover:border-border"
                      )}
                    >
                      {t === "dine_in" ? "Dine In" : "Takeaway"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="text"
                placeholder="Search menu..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-background border border-input rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Category tabs */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  activeCategory == null
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

            {/* Product grid */}
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No products found
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products.map(p => {
                  const newQty = cart
                    .filter(c => c.productId === p.id && !c.id)
                    .reduce((s, c) => s + c.quantity, 0);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className={cn(
                        "relative rounded-xl p-3 text-left border transition-all active:scale-95",
                        newQty > 0
                          ? "bg-primary/15 border-primary/50"
                          : "bg-card border-card-border hover:border-primary/30"
                      )}
                    >
                      {newQty > 0 && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground text-xs font-bold">
                            {newQty}
                          </span>
                        </div>
                      )}
                      <p className="font-semibold text-xs text-foreground leading-tight mb-1 pr-6">
                        {p.name}
                      </p>
                      <p className="text-primary font-bold text-sm">
                        {formatCurrency(p.price)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Notes */}
            <div className="pt-1">
              <input
                type="text"
                placeholder="Special instructions (optional)"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border shrink-0 space-y-3">
          {isKitchenOrder && newItemCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded-lg px-3 py-2">
              <Plus size={12} />
              <span>{newItemCount} new item{newItemCount !== 1 ? "s" : ""} will be sent to Kitchen as add-on</span>
            </div>
          )}
          {packagingCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
              <ShoppingBag size={12} />
              <span>{packagingCount} item(s) need packaging</span>
            </div>
          )}
          {errorMsg && (
            <p className="text-xs text-destructive text-center">{errorMsg}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </span>
            <span className="text-xl font-bold text-primary">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={cart.length === 0 || smartEdit.isPending}
              className="flex-[2] py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {smartEdit.isPending
                ? "Saving..."
                : isKitchenOrder && newItemCount > 0
                  ? `Save & Send ${newItemCount} to Kitchen`
                  : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
