import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListOrders,
  useUpdateOrder,
  useUpdateOrderStatus,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import type { ListOrdersQueryResult } from "@workspace/api-client-react";
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
  Search,
  X,
  UserRound,
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

export default function Queue() {
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [editOrderId, setEditOrderId] = useState<number | null>(null);
  const [editCustomerOrderId, setEditCustomerOrderId] = useState<number | null>(null);
  const [queueSearch, setQueueSearch] = useState("");

  const { data: orders = [], isLoading, dataUpdatedAt } = useListOrders(
    { status: ACTIVE_STATUSES, search: queueSearch || undefined },
    {
      query: {
        queryKey: getListOrdersQueryKey({ status: ACTIVE_STATUSES, search: queueSearch || undefined }),
        refetchInterval: 5000,
      },
    }
  );

  const updateOrder = useUpdateOrder();
  const updateStatus = useUpdateOrderStatus();

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

        {/* Search bar */}
        <div className="mt-3 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by customer name, phone or order number…"
            value={queueSearch}
            onChange={e => setQueueSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {queueSearch && (
            <button
              onClick={() => setQueueSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          )}
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

                    {/* Payment summary */}
                    <div className="text-right shrink-0 space-y-0.5 min-w-[72px]">
                      <p className="font-bold text-primary">
                        {formatCurrency(order.payment?.finalAmount ?? order.totalAmount)}
                      </p>
                      {order.payment ? (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Paid:{" "}
                            <span className={order.payment.totalPaid > 0 ? "text-green-400 font-semibold" : ""}>
                              {formatCurrency(order.payment.totalPaid)}
                            </span>
                          </p>
                          {order.payment.balance > 0 && (
                            <p className="text-xs text-amber-400 font-semibold">
                              Due: {formatCurrency(order.payment.balance)}
                            </p>
                          )}
                        </>
                      ) : (
                        order.status !== "pending_payment" && (
                          <span className="text-xs text-amber-400 font-medium">Unpaid</span>
                        )
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

                    {/* Edit Order — unified edit for all active (non-complete) orders */}
                    {["pending_payment", "approved", "preparing", "ready"].includes(order.status) && (
                      <button
                        onClick={() => setEditOrderId(order.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        <Pencil size={13} />
                        Edit Order
                      </button>
                    )}

                    {/* Edit Customer — available on all active orders */}
                    <button
                      onClick={() => setEditCustomerOrderId(order.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      <UserRound size={13} />
                      Customer
                    </button>

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

      {/* Edit Order modal — unified edit for all active orders */}
      {editOrderId !== null && (() => {
        const editOrder = orders.find(o => o.id === editOrderId);
        return editOrder ? (
          <EditOrderModal
            order={editOrder}
            onClose={() => setEditOrderId(null)}
          />
        ) : null;
      })()}

      {/* Edit Customer modal */}
      {editCustomerOrderId !== null && (() => {
        const ecOrder = orders.find(o => o.id === editCustomerOrderId);
        return ecOrder ? (
          <EditCustomerModal
            order={ecOrder}
            onClose={() => setEditCustomerOrderId(null)}
            onSuccess={() => {
              setEditCustomerOrderId(null);
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

function EditCustomerModal({
  order,
  onClose,
  onSuccess,
}: {
  order: QueueOrder;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState(order.customerName);
  const [phone, setPhone] = useState(order.customerPhone ?? "");
  const [error, setError] = useState("");
  const updateOrder = useUpdateOrder();

  const handleSave = () => {
    if (!name.trim()) { setError("Name is required."); return; }
    setError("");
    updateOrder.mutate(
      {
        id: order.id,
        data: {
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
        },
      },
      {
        onSuccess: () => onSuccess(),
        onError: () => setError("Failed to update. Please try again."),
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <UserRound size={16} className="text-primary" />
            Edit Customer
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
            <X size={15} />
          </button>
        </div>
        <p className="text-xs text-muted-foreground font-mono">{order.orderNumber}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Customer Name *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mobile Number</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
              className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={updateOrder.isPending}
            className="flex-[2] py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {updateOrder.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
