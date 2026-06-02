import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import {
  useGetOrder,
  useGetOrderPayment,
  useCreateOrderPayment,
  useUpdateOrderPayment,
  useUpdateOrderStatus,
  getGetOrderQueryKey,
  getGetOrderPaymentQueryKey,
  getListOrdersQueryKey,
  getGetDashboardQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatTime, STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ArrowLeft, CheckCircle, Banknote, Smartphone, CreditCard } from "lucide-react";

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

  const handleSetFullCash = () => { setCash(String(totalAmount)); setUpi("0"); setCard("0"); };
  const handleSetFullUpi = () => { setUpi(String(totalAmount)); setCash("0"); setCard("0"); };

  const handleSave = () => {
    const payload = {
      totalAmount,
      cashAmount: cashAmt,
      upiAmount: upiAmt,
      cardAmount: cardAmt,
    };
    if (existingPayment) {
      updatePayment.mutate({ id: orderId, data: { cashAmount: cashAmt, upiAmount: upiAmt, cardAmount: cardAmt } }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          if (isPaid) navigate("/dashboard");
        },
      });
    } else {
      createPayment.mutate({ id: orderId, data: payload }, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
          qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
          if (isPaid) navigate("/dashboard");
        },
      });
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-5">
      {/* Back */}
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Back to Dashboard
      </button>

      {/* Order summary */}
      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-mono text-xs text-muted-foreground">{order.orderNumber}</p>
            <h1 className="text-xl font-bold text-foreground">{order.customerName}</h1>
            {order.customerPhone && <p className="text-sm text-muted-foreground">{order.customerPhone}</p>}
          </div>
          <div className="text-right">
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", `status-${order.status}`)}>
              {STATUS_LABELS[order.status]}
            </span>
            <p className="text-xs text-muted-foreground mt-1">{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</p>
            <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
          </div>
        </div>

        {/* Items */}
        <div className="space-y-2 border-t border-border pt-4">
          {order.items.map(item => (
            <div key={item.id} className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium text-foreground">{item.productName}</span>
                {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
              </div>
              <div className="text-right">
                <span className="text-sm text-muted-foreground">x{item.quantity}</span>
                <span className="text-sm font-semibold text-foreground ml-3">{formatCurrency(item.price * item.quantity)}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-border mt-4 pt-3 flex justify-between items-center">
          <span className="text-base font-bold text-foreground">Total</span>
          <span className="text-2xl font-bold text-primary">{formatCurrency(totalAmount)}</span>
        </div>
      </div>

      {/* Payment entry */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <h2 className="text-base font-bold text-foreground">Payment</h2>

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

        {/* Summary */}
        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Amount</span>
            <span className="font-semibold">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount Paid</span>
            <span className="font-semibold text-emerald-400">{formatCurrency(totalPaid)}</span>
          </div>
          <div className="flex justify-between text-base font-bold">
            <span className={balance > 0 ? "text-amber-400" : "text-green-400"}>
              {balance > 0 ? "Balance Due" : "Change"}
            </span>
            <span className={balance > 0 ? "text-amber-400" : "text-green-400"}>
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
              <CheckCircle size={18} /> Mark as Paid
            </span>
          ) : "Save Payment"}
        </button>
      </div>
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
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={e => onChange(e.target.value)}
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
