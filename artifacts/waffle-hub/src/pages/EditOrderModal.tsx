import { useState } from "react";
import {
  useListCategories,
  useListProducts,
  useReplaceOrderItems,
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
} from "lucide-react";

type ItemOrderType = "dine_in" | "takeaway";

type CartItem = {
  productId: number | null;
  productName: string;
  price: number;
  quantity: number;
  itemOrderType: ItemOrderType;
};

type OrderForEdit = {
  id: number;
  orderNumber: string;
  status: string;
  orderType: string;
  notes?: string | null;
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
  pending_payment: { label: "Pending Payment", color: "text-amber-400" },
  approved: { label: "Approved", color: "text-violet-400" },
  preparing: { label: "Preparing", color: "text-blue-400" },
};

const ACTIVE_STATUSES = "pending_payment,approved,preparing,ready";

export default function EditOrderModal({
  order,
  onClose,
}: {
  order: OrderForEdit;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>(() =>
    order.items.map(i => ({
      productId: i.productId ?? null,
      productName: i.productName,
      price: i.price,
      quantity: i.quantity,
      itemOrderType: i.itemOrderType === "takeaway" ? "takeaway" : "dine_in",
    }))
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const [defaultItemType, setDefaultItemType] = useState<ItemOrderType>("dine_in");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: categories = [] } = useListCategories();
  const { data: allProducts = [] } = useListProducts({ active: true });
  const replaceItems = useReplaceOrderItems();

  const products = allProducts.filter(p => {
    const matchesCat = activeCategory == null || p.categoryId === activeCategory;
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const addToCart = (p: (typeof allProducts)[number]) => {
    setCart(prev => {
      const existing = prev.findIndex(
        c => c.productId === p.id && c.itemOrderType === defaultItemType
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
        },
      ];
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

  const toggleItemType = (idx: number) => {
    setCart(prev => {
      const item = prev[idx];
      const newType: ItemOrderType =
        item.itemOrderType === "dine_in" ? "takeaway" : "dine_in";
      const mergeIdx = prev.findIndex(
        (c, i) =>
          i !== idx && c.productId === item.productId && c.itemOrderType === newType
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

  const removeItem = (idx: number) =>
    setCart(prev => prev.filter((_, i) => i !== idx));

  const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
  const packagingCount = cart
    .filter(i => i.itemOrderType === "takeaway")
    .reduce((s, i) => s + i.quantity, 0);

  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  const handleSave = () => {
    if (cart.length === 0) {
      setErrorMsg("Add at least one item before saving.");
      return;
    }
    setErrorMsg("");
    replaceItems.mutate(
      {
        id: order.id,
        data: {
          notes: notes.trim() || null,
          items: cart.map(c => ({
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
          void qc.invalidateQueries({
            queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES }),
          });
          onClose();
        },
        onError: () => {
          setErrorMsg("Failed to save. Please try again.");
        },
      }
    );
  };

  const statusMeta = STATUS_META[order.status];

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
          {/* Current cart items */}
          <div className="p-4 pb-2 space-y-2">
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
                  key={idx}
                  className="bg-background rounded-lg px-3 py-2.5 border border-border space-y-1.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.productName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(item.price)} each
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => updateQty(idx, -1)}
                        className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="w-6 text-center text-sm font-bold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQty(idx, 1)}
                        className="w-6 h-6 rounded-md bg-secondary flex items-center justify-center hover:bg-secondary/80"
                      >
                        <Plus size={10} />
                      </button>
                      <button
                        onClick={() => removeItem(idx)}
                        className="w-6 h-6 rounded-md text-destructive/60 hover:text-destructive ml-1"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <span className="text-sm font-bold text-primary shrink-0">
                      {formatCurrency(item.price * item.quantity)}
                    </span>
                  </div>
                  {order.orderType !== "delivery" && (
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
                        <>
                          <ShoppingBag size={10} /> Takeaway
                        </>
                      ) : (
                        <>
                          <UtensilsCrossed size={10} /> Dine In
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Add items section */}
          <div className="p-4 pt-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Add items
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
                  const inCart = cart.find(c => c.productId === p.id);
                  const totalQty = cart
                    .filter(c => c.productId === p.id)
                    .reduce((s, c) => s + c.quantity, 0);
                  return (
                    <button
                      key={p.id}
                      onClick={() => addToCart(p)}
                      className={cn(
                        "relative rounded-xl p-3 text-left border transition-all active:scale-95",
                        inCart
                          ? "bg-primary/15 border-primary/50"
                          : "bg-card border-card-border hover:border-primary/30"
                      )}
                    >
                      {inCart && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                          <span className="text-primary-foreground text-xs font-bold">
                            {totalQty}
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
              disabled={cart.length === 0 || replaceItems.isPending}
              className="flex-[2] py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {replaceItems.isPending ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
