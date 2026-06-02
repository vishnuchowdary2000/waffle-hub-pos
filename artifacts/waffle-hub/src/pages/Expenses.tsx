import { useState } from "react";
import {
  useListExpenses,
  useCreateExpense,
  useDeleteExpense,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIODS = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
];

const PAYMENT_METHODS = ["cash", "upi", "card", "other"];

export default function Expenses() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [showForm, setShowForm] = useState(false);

  const { data: expenses = [], isLoading } = useListExpenses(
    { period },
    { query: { queryKey: getListExpensesQueryKey({ period }) } }
  );

  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const [form, setForm] = useState({
    title: "", amount: "", paymentMethod: "cash", notes: "",
  });

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;
    createExpense.mutate({
      data: {
        title: form.title.trim(),
        amount: parseFloat(form.amount),
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim() || undefined,
      },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListExpensesQueryKey({ period }) });
        setForm({ title: "", amount: "", paymentMethod: "cash", notes: "" });
        setShowForm(false);
      },
    });
  };

  const handleDelete = (id: number) => {
    deleteExpense.mutate({ id }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getListExpensesQueryKey({ period }) }),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track daily spending</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90"
        >
          <Plus size={14} /> Add Expense
        </button>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {PERIODS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key as typeof period)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              period === p.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">New Expense</h2>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Expense title *"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
              <input
                type="number"
                placeholder="Amount"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-background border border-input rounded-lg pl-7 pr-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                required
              />
            </div>
            <select
              value={form.paymentMethod}
              onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring capitalize"
            >
              {PAYMENT_METHODS.map(m => <option key={m} value={m} className="capitalize">{m.toUpperCase()}</option>)}
            </select>
            <div className="col-span-2">
              <input
                type="text"
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={createExpense.isPending}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {createExpense.isPending ? "Adding..." : "Add Expense"}
          </button>
        </form>
      )}

      {/* Total */}
      <div className="bg-destructive/10 border border-destructive/30 rounded-xl px-5 py-4 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Total {PERIODS.find(p => p.key === period)?.label} Expenses
        </p>
        <p className="text-2xl font-bold text-destructive">{formatCurrency(total)}</p>
      </div>

      {/* Expense list */}
      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>}
        {!isLoading && expenses.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No expenses recorded</p>
        )}
        {expenses.map(expense => (
          <div key={expense.id} className="bg-card border border-card-border rounded-xl px-4 py-3.5 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{expense.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs px-2 py-0.5 bg-secondary rounded-full text-muted-foreground uppercase tracking-wide">
                  {expense.paymentMethod}
                </span>
                {expense.notes && <span className="text-xs text-muted-foreground truncate">{expense.notes}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-bold text-destructive">{formatCurrency(expense.amount)}</p>
              <p className="text-xs text-muted-foreground">{formatDate(expense.expenseDate)}</p>
            </div>
            <button
              onClick={() => handleDelete(expense.id)}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
