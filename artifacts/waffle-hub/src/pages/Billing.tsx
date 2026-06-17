import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetOrder,
  useGetOrderPayment,
  useCreateOrderPayment,
  useUpdateOrderPayment,
  useUpdateOrderStatus,
  useVoidOrderPayment,
  getGetOrderQueryKey,
  getGetOrderPaymentQueryKey,
  getListOrdersQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatTime, STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle, Banknote, Smartphone, CreditCard, Phone, ShoppingBag, UtensilsCrossed, XCircle, AlertTriangle } from "lucide-react";

const statusClass: Record<string, string> = {
  pending_payment: "status-pending_payment",
  approved:   "status-approved",
  preparing:  "status-preparing",
  ready:      "status-ready",
  completed:  "status-completed",
  cancelled:  "status-cancelled",
};

export default function Billing() {
  const [, params] = useRoute("/billing/:id");
  const [, navigate] = useLocation();
  const orderId = params ? parseInt(params.id) : 0;
  const qc = useQueryClient();

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId) },
  });

  const { data: existingPayment } = useGetOrderPayment(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderPaymentQueryKey(orderId) },
  });

  const createPayment = useCreateOrderPayment();
  const updatePayment = useUpdateOrderPayment();
  const updateStatus = useUpdateOrderStatus();
  const voidPayment = useVoidOrderPayment();

  const [cash, setCash] = useState("0");
  const [upi, setUpi] = useState("0");
  const [card, setCard] = useState("0");

  useEffect(() => {
    if (existingPayment) {
      setCash(String(existingPayment.cashAmount));
      setUpi(String(existingPayment.upiAmount));
      setCard(String(existingPayment.cardAmount));
    }
  }, [existingPayment]);

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const totalAmount = order.totalAmount;
  const cashAmt = parseFloat(cash) || 0;
  const upiAmt = parseFloat(upi) || 0;
  const cardAmt = parseFloat(card) || 0;
  const totalPaid = cashAmt + upiAmt + cardAmt;
  const balance = totalAmount - totalPaid;
  const isPaid = balance <= 0;

  // Previously paid (from existing payment record)
  const alreadyPaid = existingPayment ? existingPayment.totalPaid : 0;
  const pending = totalAmount - alreadyPaid;

  const handleSetFullCash = () => { setCash(String(totalAmount)); setUpi("0"); setCard("0"); };
  const handleSetFullUpi = () => { setUpi(String(totalAmount)); setCash("0"); setCard("0"); };

  const handleSave = () => {
    const afterSave = () => {
      qc.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
      qc.invalidateQueries({ queryKey: getGetOrderPaymentQueryKey(orderId) });
      qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      if (isPaid) navigate("/dashboard");
    };

    if (existingPayment) {
      updatePayment.mutate({ id: orderId, data: { cashAmount: cashAmt, upiAmount: upiAmt, cardAmount: cardAmt } }, {
        onSuccess: () => {
          // Auto-approve if still pending_payment
          if (order.status === "pending_payment") {
            updateStatus.mutate({ id: orderId, data: { status: "approved" } }, { onSuccess: afterSave });
          } else {
            afterSave();
          }
        },
      });
    } else {
      createPayment.mutate({ id: orderId, data: { totalAmount, cashAmount: cashAmt, upiAmount: upiAmt, cardAmount: cardAmt } }, {
        onSuccess: () => {
          // Backend auto-approves; just refresh
          afterSave();
        },
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      <button onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Order summary */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-mono text-sm font-bold text-primary">{order.orderNumber}</p>
            <h1 className="text-xl font-bold text-foreground mt-0.5">{order.customerName}</h1>
            {order.customerPhone && (
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Phone size={13} /> {order.customerPhone}
              </p>
            )}
          </div>
          <div className="text-right">
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusClass[order.status])}>
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            <p className="text-xs text-muted-foreground mt-1">{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</p>
            <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2 border-t border-border pt-4">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{item.productName}</span>
                {item.itemOrderType === "takeaway"
                  ? <span className="text-xs bg-blue-500/15 text-blue-400 px-1.5 py-0.5 rounded flex items-center gap-1"><ShoppingBag size={9} /> Pack</span>
                  : <span className="text-xs bg-secondary text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-1"><UtensilsCrossed size={9} /> Dine</span>
                }
                {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
              </div>
              <div className="text-right flex items-center gap-3">
                <span className="text-sm text-muted-foreground">×{item.quantity}</span>
                <span className="text-sm font-semibold text-foreground">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals summary box */}
        <div className="mt-4 border-t border-border pt-4 bg-secondary/40 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount</span>
            <span className="font-bold text-foreground">{formatCurrency(totalAmount)}</span>
          </div>
          {alreadyPaid > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="font-semibold text-green-400">{formatCurrency(alreadyPaid)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold border-t border-border/50 pt-2">
            <span className={pending <= 0 ? "text-green-400" : "text-amber-400"}>
              {pending <= 0 ? "Fully Paid ✓" : "Pending Amount"}
            </span>
            <span className={pending <= 0 ? "text-green-400" : "text-amber-400"}>
              {pending <= 0 ? formatCurrency(totalAmount) : formatCurrency(pending)}
            </span>
          </div>
        </div>
      </div>

      {/* ── Void Payment — shown only for cancelled orders with a live payment ── */}
      {order.status === "cancelled" && existingPayment && existingPayment.status !== "voided" && existingPayment.totalPaid > 0 && (
        <div className="bg-destructive/8 border border-destructive/25 rounded-xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="text-destructive mt-0.5 shrink-0" />
            <div>
              <h2 className="text-base font-bold text-foreground">Payment Nullification</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                This order was cancelled after a payment of{" "}
                <span className="font-semibold text-foreground">{formatCurrency(existingPayment.totalPaid)}</span> was recorded.
                Voiding will zero out all payment amounts and mark this as refunded.
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg px-4 py-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cash</span>
              <span className="font-medium">{formatCurrency(existingPayment.cashAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">UPI</span>
              <span className="font-medium">{formatCurrency(existingPayment.upiAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Card</span>
              <span className="font-medium">{formatCurrency(existingPayment.cardAmount)}</span>
            </div>
            <div className="flex justify-between border-t border-border/50 pt-1.5 font-bold">
              <span>Total Paid</span>
              <span className="text-green-400">{formatCurrency(existingPayment.totalPaid)}</span>
            </div>
          </div>

          <button
            onClick={() => voidPayment.mutate({ id: orderId }, {
              onSuccess: () => {
                qc.invalidateQueries({ queryKey: getGetOrderPaymentQueryKey(orderId) });
                qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
                qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
              },
            })}
            disabled={voidPayment.isPending}
            className="w-full py-3.5 rounded-xl text-sm font-bold bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
          >
            <XCircle size={16} />
            {voidPayment.isPending ? "Voiding…" : "Void Payment (Nullify ₹" + existingPayment.totalPaid.toFixed(0) + ")"}
          </button>
        </div>
      )}

      {/* Voided confirmation */}
      {order.status === "cancelled" && existingPayment?.status === "voided" && (
        <div className="bg-secondary/50 border border-border rounded-xl px-5 py-4 flex items-center gap-3">
          <XCircle size={18} className="text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-bold text-foreground">Payment Voided</p>
            <p className="text-xs text-muted-foreground mt-0.5">All payment amounts have been nullified. No funds are recorded against this order.</p>
          </div>
        </div>
      )}

      {/* Payment entry — hidden for cancelled orders */}
      {order.status !== "cancelled" && <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-foreground">Collect Payment</h2>

        <PaymentField
          icon={<Banknote size={16} className="text-emerald-400" />}
          label="Cash"
          value={cash}
          onChange={setCash}
          onSetFull={handleSetFullCash}
          color="text-emerald-400"
        />
        <PaymentField
          icon={<Smartphone size={16} className="text-blue-400" />}
          label="UPI / QR"
          value={upi}
          onChange={setUpi}
          onSetFull={handleSetFullUpi}
          color="text-blue-400"
        />
        <PaymentField
          icon={<CreditCard size={16} className="text-purple-400" />}
          label="Card"
          value={card}
          onChange={setCard}
          color="text-purple-400"
        />

        {/* Live payment summary */}
        <div className="border-t border-border pt-4 bg-secondary/40 rounded-xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount</span>
            <span className="font-semibold">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="font-semibold text-green-400">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex justify-between text-base font-bold border-t border-border/50 pt-2">
            <span className={balance <= 0 ? "text-green-400" : "text-amber-400"}>
              {balance <= 0 ? "Change / Fully Paid" : "Pending Amount"}
            </span>
            <span className={balance <= 0 ? "text-green-400" : "text-amber-400"}>
              {formatCurrency(Math.abs(balance))}
            </span>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={createPayment.isPending || updatePayment.isPending}
          className={cn(
            "w-full py-4 rounded-xl text-base font-bold transition-all",
            isPaid
              ? "bg-green-600 hover:bg-green-500 text-white"
              : "bg-primary hover:opacity-90 text-primary-foreground",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          {isPaid ? (
            <span className="flex items-center justify-center gap-2">
              <CheckCircle size={18} /> Mark as Fully Paid
            </span>
          ) : "Save Partial Payment"}
        </button>
      </div>}
    </div>
  );
}

function PaymentField({
  icon, label, value, onChange, onSetFull, color,
}: {
  icon: React.ReactNode; label: string; value: string;
  onChange: (v: string) => void; onSetFull?: () => void; color: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex items-center gap-2 w-28 shrink-0", color)}>
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="flex-1 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
        <input
          type="number" min="0" step="1" value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-background border border-input rounded-lg pl-7 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {onSetFull && (
        <button onClick={onSetFull} className="shrink-0 text-xs px-2.5 py-2 bg-secondary text-muted-foreground hover:text-foreground rounded-lg">
          Full
        </button>
      )}
    </div>
  );
}
