import { useParams } from "wouter";
import { useTrackPublicOrder, getTrackPublicOrderQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  ChefHat, Clock, CheckCircle2, RefreshCw,
  UtensilsCrossed, ShoppingBag, Zap, AlertCircle,
} from "lucide-react";

const STATUSES = [
  { key: "pending_payment", label: "Pending Payment",  icon: Clock,          color: "text-amber-400",  bg: "bg-amber-500/20 border-amber-500/40" },
  { key: "approved",        label: "Approved",          icon: CheckCircle2,   color: "text-violet-400", bg: "bg-violet-500/20 border-violet-500/40" },
  { key: "preparing",       label: "Preparing",         icon: ChefHat,        color: "text-blue-400",   bg: "bg-blue-500/20 border-blue-500/40" },
  { key: "ready",           label: "Ready! 🎉",         icon: CheckCircle2,   color: "text-green-400",  bg: "bg-green-500/20 border-green-500/40" },
  { key: "completed",       label: "Completed ✓",       icon: CheckCircle2,   color: "text-green-500",  bg: "bg-green-600/20 border-green-600/40" },
];

const CANCELLED_STATUS = { key: "cancelled", label: "Cancelled", icon: AlertCircle, color: "text-destructive", bg: "bg-destructive/20 border-destructive/40" };

function statusIndex(status: string) {
  const idx = STATUSES.findIndex(s => s.key === status);
  return idx === -1 ? 0 : idx;
}

export default function CustomerTrack() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = params.orderNumber ?? "";

  const { data: order, isLoading, isError } = useTrackPublicOrder(
    orderNumber,
    { query: { queryKey: getTrackPublicOrderQueryKey(orderNumber), refetchInterval: 5000 } }
  );

  const isCancelled = order?.status === "cancelled";
  const currentIdx = order ? statusIndex(order.status) : 0;
  const currentStatus = isCancelled ? CANCELLED_STATUS : (STATUSES[currentIdx] ?? STATUSES[0]);

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
                <AlertCircle size={32} className="text-destructive mx-auto" />
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

            {/* Pay at counter notice */}
            {order.status === "pending_payment" && (
              <div className="flex gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400/90 leading-relaxed">
                  <strong>Please pay at the counter.</strong> Your order will be prepared after payment approval.
                </p>
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
