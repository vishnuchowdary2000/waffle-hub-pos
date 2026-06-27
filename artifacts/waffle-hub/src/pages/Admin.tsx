import { useState } from "react";
import {
  useListCustomers,
  useDeleteCustomer,
  useUpdateCustomer,
  useListExpenses,
  useCreateExpense,
  useDeleteExpense,
  useGetDailyReport,
  useGetProductReport,
  useListUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useGetStoreSettings,
  useUpdateStoreSettings,
  useListStoreAnnouncements,
  useCreateStoreAnnouncement,
  useUpdateStoreAnnouncement,
  useDeleteStoreAnnouncement,
  useListTables,
  useConfigureTables,
  useUpdateTableStatus,
  useListPrintHistory,
  getListCustomersQueryKey,
  getListExpensesQueryKey,
  getGetDailyReportQueryKey,
  getGetProductReportQueryKey,
  getListUsersQueryKey,
  getGetStoreSettingsQueryKey,
  getListStoreAnnouncementsQueryKey,
  getListTablesQueryKey,
  getListPrintHistoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Users, Receipt, BarChart3,
  Trash2, Search, AlertTriangle, X,
  Plus, RefreshCw, Eraser,
  TrendingUp, TrendingDown, ShieldCheck,
  UserCog, KeyRound, ToggleLeft, ToggleRight, ChefHat, ShoppingBag,
  Store, Megaphone, Clock, Check, Pencil, Phone,
  Printer, MapPin, FileText, LayoutGrid, QrCode, Download, History,
} from "lucide-react";
import { type PaperSize, triggerBrowserPrint, generateReceiptHTML } from "@/lib/printService";

type Tab = "customers" | "expenses" | "reports" | "users" | "store" | "tables";

const ROLE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  admin:   { label: "Admin",   color: "text-amber-400 bg-amber-500/10 border-amber-500/30",   icon: ShieldCheck },
  counter: { label: "Counter", color: "text-blue-400 bg-blue-500/10 border-blue-500/30",     icon: ShoppingBag },
  kitchen: { label: "Kitchen", color: "text-green-400 bg-green-500/10 border-green-500/30",  icon: ChefHat },
};

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-0 border-b border-border shrink-0">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <ShieldCheck size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">User management, customers, expenses & reports</p>
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto">
          {([
            { key: "users",     label: "Users",     icon: UserCog },
            { key: "customers", label: "Customers", icon: Users },
            { key: "expenses",  label: "Expenses",  icon: Receipt },
            { key: "reports",   label: "Reports",   icon: BarChart3 },
            { key: "store",     label: "Store",     icon: Store },
            { key: "tables",    label: "Tables",    icon: LayoutGrid },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors whitespace-nowrap",
                tab === key
                  ? "text-primary border-primary bg-primary/5"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              )}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {tab === "users"     && <UsersTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "expenses"  && <ExpensesTab />}
        {tab === "reports"   && <ReportsTab />}
        {tab === "store"     && <StoreTab />}
        {tab === "tables"    && <TablesTab />}
      </div>
    </div>
  );
}

/* ── Customers Tab ──────────────────────────────────────────────────────────── */

function CustomersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());
  const [editCustomer, setEditCustomer] = useState<{ id: number; name: string; phone: string } | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editError, setEditError] = useState("");

  const { data: customers = [], isLoading } = useListCustomers(
    { search: search || undefined },
    { query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) } }
  );
  const deleteCustomer = useDeleteCustomer();
  const updateCustomer = useUpdateCustomer();

  const zeroOrderCustomers = customers.filter(c => c.orderCount === 0);
  const confirmCustomer = customers.find(c => c.id === confirmId);

  const doDelete = (id: number) => {
    setBusyIds(prev => new Set(prev).add(id));
    deleteCustomer.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setConfirmId(null);
      },
      onSettled: () => setBusyIds(prev => { const s = new Set(prev); s.delete(id); return s; }),
    });
  };

  const doBulkDelete = async () => {
    setConfirmBulk(false);
    for (const c of zeroOrderCustomers) {
      await new Promise<void>(resolve => {
        deleteCustomer.mutate({ id: c.id }, { onSettled: () => resolve() });
      });
    }
    qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
  };

  const openEdit = (c: { id: number; name: string; phone?: string | null }) => {
    setEditCustomer({ id: c.id, name: c.name, phone: c.phone ?? "" });
    setEditName(c.name);
    setEditPhone(c.phone ?? "");
    setEditError("");
  };

  const doEditSave = () => {
    if (!editName.trim()) { setEditError("Name is required."); return; }
    if (!editCustomer) return;
    setEditError("");
    updateCustomer.mutate(
      { id: editCustomer.id, data: { name: editName.trim(), phone: editPhone.trim() || undefined } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setEditCustomer(null);
        },
        onError: () => setEditError("Failed to update. Try again."),
      }
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or phone..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        {zeroOrderCustomers.length > 0 && (
          <button
            onClick={() => setConfirmBulk(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 rounded-lg text-sm font-semibold transition-colors"
          >
            <Trash2 size={14} />
            Clean Up — {zeroOrderCustomers.length} with no orders
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{customers.length} customers total · {zeroOrderCustomers.length} with 0 orders</p>

      {/* Customer list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-primary" size={24} /></div>
      ) : customers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No customers found</div>
      ) : (
        <div className="space-y-2">
          {customers.map(c => (
            <div
              key={c.id}
              className={cn(
                "bg-card border rounded-xl px-4 py-3.5 flex items-center gap-4",
                c.orderCount === 0 ? "border-destructive/30 bg-destructive/5" : "border-card-border"
              )}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: c.orderCount === 0 ? "rgba(239,68,68,0.15)" : "rgba(251,146,60,0.15)" }}>
                <span className={cn("font-bold text-sm", c.orderCount === 0 ? "text-red-400" : "text-primary")}>
                  {c.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                  {c.orderCount === 0 && (
                    <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-medium shrink-0">No Orders</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{c.phone ?? "—"}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-bold text-primary">{formatCurrency(c.totalSpending)}</p>
                <p className="text-xs text-muted-foreground">{c.orderCount} order{c.orderCount !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => openEdit(c)}
                disabled={busyIds.has(c.id)}
                className="p-2 rounded-lg bg-secondary hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40 shrink-0"
                title="Edit customer"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => setConfirmId(c.id)}
                disabled={busyIds.has(c.id)}
                className="p-2 rounded-lg bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 shrink-0"
                title="Delete customer"
              >
                {busyIds.has(c.id) ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Edit customer modal */}
      {editCustomer && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <Users size={16} className="text-primary" />
                Edit Customer
              </h3>
              <button onClick={() => setEditCustomer(null)} className="p-1 rounded-lg hover:bg-secondary text-muted-foreground">
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Customer Name *</label>
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doEditSave()}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Mobile Number</label>
                <input
                  type="tel"
                  value={editPhone}
                  onChange={e => setEditPhone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && doEditSave()}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            {editError && <p className="text-xs text-destructive">{editError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditCustomer(null)}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={doEditSave}
                disabled={updateCustomer.isPending}
                className="flex-[2] py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {updateCustomer.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Single delete confirm */}
      {confirmId && confirmCustomer && (
        <ConfirmModal
          title="Delete this customer?"
          description={
            <>
              <span className="font-semibold">{confirmCustomer.name}</span>
              {confirmCustomer.phone ? ` · ${confirmCustomer.phone}` : ""}
              {confirmCustomer.orderCount > 0 && (
                <span className="block mt-1 text-amber-400">⚠ This customer has {confirmCustomer.orderCount} order(s). Only the customer record is deleted — orders are kept.</span>
              )}
            </>
          }
          confirmLabel="Delete Customer"
          onCancel={() => setConfirmId(null)}
          onConfirm={() => doDelete(confirmId)}
        />
      )}

      {/* Bulk delete confirm */}
      {confirmBulk && (
        <ConfirmModal
          title={`Delete ${zeroOrderCustomers.length} customers with no orders?`}
          description="These customers were created but never completed a purchase. This cannot be undone."
          confirmLabel={`Delete ${zeroOrderCustomers.length} Customers`}
          onCancel={() => setConfirmBulk(false)}
          onConfirm={doBulkDelete}
        />
      )}
    </div>
  );
}

/* ── Expenses Tab ─────────────────────────────────────────────────────────── */

const PERIODS = [
  { key: "daily" as const,   label: "Today" },
  { key: "weekly" as const,  label: "This Week" },
  { key: "monthly" as const, label: "This Month" },
];
const PAYMENT_METHODS = ["cash", "upi", "card", "other"];

function ExpensesTab() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", amount: "", paymentMethod: "cash", notes: "" });

  const { data: expenses = [], isLoading } = useListExpenses(
    { period }, { query: { queryKey: getListExpensesQueryKey({ period }) } }
  );
  const createExpense = useCreateExpense();
  const deleteExpense = useDeleteExpense();

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.amount) return;
    createExpense.mutate({
      data: { title: form.title.trim(), amount: parseFloat(form.amount), paymentMethod: form.paymentMethod, notes: form.notes.trim() || undefined },
    }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
        setForm({ title: "", amount: "", paymentMethod: "cash", notes: "" });
        setShowForm(false);
      },
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-2">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                period === p.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
              )}>
              {p.label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold">
          <Plus size={14} /> Add Expense
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">New Expense</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Title *" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="col-span-2 bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input required type="number" min="1" placeholder="Amount (₹) *" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
            <input placeholder="Notes (optional)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="col-span-2 bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button type="submit" disabled={createExpense.isPending}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50">
            {createExpense.isPending ? "Saving..." : "Save Expense"}
          </button>
        </form>
      )}

      <div className="bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3 flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Total {PERIODS.find(p => p.key === period)?.label} Expenses</span>
        <span className="text-xl font-bold text-destructive">{formatCurrency(total)}</span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-primary" size={24} /></div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">No expenses recorded</div>
      ) : (
        <div className="space-y-2">
          {expenses.map(exp => (
            <div key={exp.id} className="bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{exp.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground capitalize">{exp.paymentMethod}</span>
                  {exp.notes && <span className="text-xs text-muted-foreground truncate">· {exp.notes}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-bold text-sm text-destructive">{formatCurrency(exp.amount)}</p>
                <p className="text-xs text-muted-foreground">{formatDate(exp.createdAt)}</p>
              </div>
              <button
                onClick={() => deleteExpense.mutate({ id: exp.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListExpensesQueryKey() }) })}
                className="p-2 rounded-lg bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Reports Tab ──────────────────────────────────────────────────────────── */

function ReportsTab() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const today = new Date().toISOString().split("T")[0];

  const { data: daily, isLoading: dailyLoading } = useGetDailyReport(
    { date: today }, { query: { queryKey: getGetDailyReportQueryKey({ date: today }) } }
  );
  const { data: products = [], isLoading: prodLoading } = useGetProductReport(
    { period }, { query: { queryKey: getGetProductReportQueryKey({ period }) } }
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Today's summary */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-3">Today's Summary</h2>
        {dailyLoading ? (
          <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-primary" size={24} /></div>
        ) : daily ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Total Orders" value={String(daily.totalOrders)} />
              <MetricCard label="Completed"    value={String(daily.completedOrders)} color="text-green-400" />
              <MetricCard label="Cancelled"    value={String(daily.cancelledOrders)} color="text-red-400" />
              <MetricCard label="Avg Order"    value={formatCurrency(daily.avgOrderValue)} color="text-blue-400" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(daily.totalRevenue)}</p>
                <div className="mt-2 space-y-1">
                  {daily.cashRevenue > 0  && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Cash</span><span className="text-emerald-400">{formatCurrency(daily.cashRevenue)}</span></div>}
                  {daily.upiRevenue > 0   && <div className="flex justify-between text-xs"><span className="text-muted-foreground">UPI</span><span className="text-blue-400">{formatCurrency(daily.upiRevenue)}</span></div>}
                  {daily.cardRevenue > 0  && <div className="flex justify-between text-xs"><span className="text-muted-foreground">Card</span><span className="text-purple-400">{formatCurrency(daily.cardRevenue)}</span></div>}
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Expenses</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(daily.totalExpenses)}</p>
                <div className="flex items-center gap-1 mt-2">
                  <TrendingDown size={13} className="text-destructive" />
                  <span className="text-xs text-muted-foreground">Today's costs</span>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">Est. Profit</p>
                <p className={cn("text-2xl font-bold", daily.estimatedProfit >= 0 ? "text-green-400" : "text-red-400")}>
                  {formatCurrency(daily.estimatedProfit)}
                </p>
                <div className="flex items-center gap-1 mt-2">
                  {daily.estimatedProfit >= 0
                    ? <TrendingUp size={13} className="text-green-400" />
                    : <TrendingDown size={13} className="text-red-400" />}
                  <span className="text-xs text-muted-foreground">Revenue − Expenses</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">No data for today</div>
        )}
      </div>

      {/* Best-selling products */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-bold text-foreground">Best Selling Products</h2>
          <div className="flex gap-1.5">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  period === p.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                )}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        {prodLoading ? (
          <div className="flex justify-center py-8"><RefreshCw className="animate-spin text-primary" size={20} /></div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No sales data</div>
        ) : (
          <div className="space-y-2">
            {products.slice(0, 10).map((p, i) => (
              <div key={p.productName} className="bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-4">
                <span className={cn("text-lg font-bold w-8 shrink-0 text-center", i === 0 ? "text-amber-400" : i === 1 ? "text-slate-400" : i === 2 ? "text-orange-600" : "text-muted-foreground")}>
                  #{i + 1}
                </span>
                <p className="flex-1 font-semibold text-sm text-foreground min-w-0 truncate">{p.productName}</p>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(p.totalRevenue)}</p>
                  <p className="text-xs text-muted-foreground">{p.totalQuantity} sold</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Users Tab ───────────────────────────────────────────────────────────────── */

function UsersTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "counter", displayName: "" });
  const [editForm, setEditForm] = useState({ username: "", role: "counter", displayName: "", password: "", active: true });
  const [busyIds, setBusyIds] = useState<Set<number>>(new Set());

  const { data: users = [], isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();

  const invalidate = () => void qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password || !form.role) return;
    createUser.mutate(
      { data: { username: form.username.trim(), password: form.password, role: form.role, displayName: form.displayName.trim() || undefined } },
      { onSuccess: () => { invalidate(); setShowForm(false); setForm({ username: "", password: "", role: "counter", displayName: "" }); } }
    );
  };

  const openEdit = (user: (typeof users)[0]) => {
    setEditId(user.id);
    setEditForm({ username: user.username, role: user.role, displayName: user.displayName ?? "", password: "", active: user.active });
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editId) return;
    setBusyIds(prev => new Set(prev).add(editId));
    const updates: Record<string, unknown> = {
      username: editForm.username.trim(),
      role: editForm.role,
      displayName: editForm.displayName.trim() || null,
      active: editForm.active,
    };
    if (editForm.password) updates.password = editForm.password;
    updateUser.mutate(
      { id: editId, data: updates },
      {
        onSuccess: () => { invalidate(); setEditId(null); },
        onSettled: () => setBusyIds(prev => { const s = new Set(prev); s.delete(editId!); return s; }),
      }
    );
  };

  const doDelete = (id: number) => {
    setBusyIds(prev => new Set(prev).add(id));
    setConfirmDeleteId(null);
    deleteUser.mutate({ id }, {
      onSuccess: invalidate,
      onSettled: () => setBusyIds(prev => { const s = new Set(prev); s.delete(id); return s; }),
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-xs text-muted-foreground">{users.length} user{users.length !== 1 ? "s" : ""} total</p>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold"
        >
          <Plus size={14} /> Add User
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="bg-card border border-card-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">New User</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Username *" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input required placeholder="Display Name" value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <input required type="password" placeholder="Password *" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="bg-background border border-input rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="admin">Admin</option>
              <option value="counter">Counter</option>
              <option value="kitchen">Kitchen</option>
            </select>
          </div>
          <button type="submit" disabled={createUser.isPending}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold disabled:opacity-50">
            {createUser.isPending ? "Creating..." : "Create User"}
          </button>
        </form>
      )}

      {/* User list */}
      {isLoading ? (
        <div className="flex justify-center py-12"><RefreshCw className="animate-spin text-primary" size={24} /></div>
      ) : (
        <div className="space-y-2">
          {users.map(user => {
            const meta = ROLE_META[user.role];
            const RoleIcon = meta?.icon ?? ShieldCheck;
            const isBusy = busyIds.has(user.id);
            const isEditing = editId === user.id;

            return (
              <div key={user.id} className={cn("bg-card border border-card-border rounded-xl overflow-hidden", !user.active && "opacity-60")}>
                {/* User row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="font-bold text-sm text-primary">{user.username.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">
                        {user.displayName ?? user.username}
                      </span>
                      {user.displayName && (
                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                      )}
                      <span className={cn("flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium", meta?.color ?? "text-muted-foreground")}>
                        <RoleIcon size={11} />
                        {meta?.label ?? user.role}
                      </span>
                      {!user.active && (
                        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full border border-destructive/20 font-medium">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Added {formatDate(user.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => isEditing ? setEditId(null) : openEdit(user)}
                      disabled={isBusy}
                      className={cn(
                        "p-2 rounded-lg text-sm transition-colors",
                        isEditing ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground"
                      )}
                      title="Edit user"
                    >
                      <UserCog size={14} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(user.id)}
                      disabled={isBusy}
                      className="p-2 rounded-lg bg-secondary hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                      title="Delete user"
                    >
                      {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>

                {/* Inline edit form */}
                {isEditing && (
                  <form onSubmit={handleEdit} className="border-t border-border px-4 py-3 space-y-3 bg-background/30">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Username</label>
                        <input value={editForm.username} onChange={e => setEditForm(f => ({ ...f, username: e.target.value }))}
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Display Name</label>
                        <input value={editForm.displayName} onChange={e => setEditForm(f => ({ ...f, displayName: e.target.value }))}
                          placeholder="Optional"
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><KeyRound size={11} /> New Password (leave blank to keep)</label>
                        <input type="password" value={editForm.password} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))}
                          placeholder="••••••••"
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Role</label>
                        <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                          className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="admin">Admin</option>
                          <option value="counter">Counter</option>
                          <option value="kitchen">Kitchen</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setEditForm(f => ({ ...f, active: !f.active }))}
                        className={cn(
                          "flex items-center gap-2 text-sm font-medium transition-colors",
                          editForm.active ? "text-green-400" : "text-muted-foreground"
                        )}
                      >
                        {editForm.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        {editForm.active ? "Active" : "Inactive"}
                      </button>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setEditId(null)}
                          className="px-4 py-2 bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                          Cancel
                        </button>
                        <button type="submit" disabled={updateUser.isPending}
                          className="px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-lg disabled:opacity-50">
                          {updateUser.isPending ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteId !== null && (
        <ConfirmModal
          title="Delete this user?"
          description={
            <>
              <span className="font-semibold">{users.find(u => u.id === confirmDeleteId)?.username}</span> will be permanently deleted and won't be able to log in.
            </>
          }
          confirmLabel="Delete User"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={() => doDelete(confirmDeleteId)}
        />
      )}
    </div>
  );
}

/* ── Store Tab ──────────────────────────────────────────────────────────────── */

function StoreTab() {
  const qc = useQueryClient();

  // Settings
  const { data: settings, isLoading: settingsLoading } = useGetStoreSettings({
    query: { queryKey: getGetStoreSettingsQueryKey() },
  });
  const updateSettings = useUpdateStoreSettings();

  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [timingsSaved, setTimingsSaved] = useState(false);
  const [contactNumber, setContactNumber] = useState("");
  const [contactSaved, setContactSaved] = useState(false);

  // Shop info + print settings state
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [fssaiNumber, setFssaiNumber] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [thankYouMessage, setThankYouMessage] = useState("");
  const [shopInfoSaved, setShopInfoSaved] = useState(false);

  // Sync local time inputs when settings load
  const loadedOpenTime = settings?.openTime ?? "";
  const loadedCloseTime = settings?.closeTime ?? "";
  const loadedContactNumber = settings?.contactNumber ?? "";

  const effectiveOpenTime = openTime || loadedOpenTime;
  const effectiveCloseTime = closeTime || loadedCloseTime;

  const saveTimings = () => {
    updateSettings.mutate(
      { data: { openTime: effectiveOpenTime, closeTime: effectiveCloseTime } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() });
          setTimingsSaved(true);
          setTimeout(() => setTimingsSaved(false), 2000);
        },
      }
    );
  };

  const setManualStatus = (isOpen: boolean) => {
    updateSettings.mutate(
      { data: { manualOverride: true, isOpen } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() }) }
    );
  };

  const clearManualOverride = () => {
    updateSettings.mutate(
      { data: { manualOverride: false } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() }) }
    );
  };

  const saveContactNumber = () => {
    const val = contactNumber !== "" ? contactNumber : loadedContactNumber;
    updateSettings.mutate(
      { data: { contactNumber: val } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() });
          setContactSaved(true);
          setTimeout(() => setContactSaved(false), 2000);
        },
      }
    );
  };

  // Printer name inputs
  const [receiptPrinterName, setReceiptPrinterName] = useState("");
  const [kotPrinterName, setKotPrinterName] = useState("");
  const [printersSaved, setPrintersSaved] = useState(false);

  // Custom paper state
  const [customPaperWidth, setCustomPaperWidth] = useState("");
  const [customPaperHeight, setCustomPaperHeight] = useState("");
  const [customPaperSaved, setCustomPaperSaved] = useState(false);

  const togglePrintSetting = (key: "receiptPrinting" | "kotPrinting" | "autoPrint" | "autoPrintReceipt", value: boolean) => {
    updateSettings.mutate(
      { data: { [key]: value } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() }) }
    );
  };

  const savePaperSize = (size: string) => {
    updateSettings.mutate(
      { data: { paperSize: size } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() }) }
    );
  };

  const saveCustomPaper = () => {
    const w = parseInt(customPaperWidth) || (settings?.customPaperWidth ?? 80);
    const h = customPaperHeight !== "" ? (parseInt(customPaperHeight) || null) : (settings?.customPaperHeight ?? null);
    updateSettings.mutate(
      { data: { paperSize: "custom", customPaperWidth: w, customPaperHeight: h } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() });
          setCustomPaperSaved(true);
          setTimeout(() => setCustomPaperSaved(false), 2000);
        },
      }
    );
  };

  const savePrinterNames = () => {
    const rp = receiptPrinterName !== "" ? receiptPrinterName : (settings?.receiptPrinterName ?? "");
    const kp = kotPrinterName     !== "" ? kotPrinterName     : (settings?.kotPrinterName     ?? "");
    updateSettings.mutate(
      { data: { receiptPrinterName: rp, kotPrinterName: kp } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() });
          setPrintersSaved(true);
          setTimeout(() => setPrintersSaved(false), 2000);
        },
      }
    );
  };

  const { data: printHistory = [] } = useListPrintHistory(
    {},
    { query: { queryKey: getListPrintHistoryQueryKey({}) } }
  );

  const saveShopInfo = () => {
    updateSettings.mutate(
      {
        data: {
          shopName:        shopName        !== "" ? shopName        : (settings?.shopName        ?? "The Waffle Hub"),
          shopAddress:     shopAddress     !== "" ? shopAddress     : (settings?.shopAddress     ?? ""),
          shopPhone:       shopPhone       !== "" ? shopPhone       : (settings?.shopPhone       ?? ""),
          fssaiNumber:     fssaiNumber     !== "" ? fssaiNumber     : (settings?.fssaiNumber     ?? ""),
          gstNumber:       gstNumber       !== "" ? gstNumber       : (settings?.gstNumber       ?? ""),
          thankYouMessage: thankYouMessage !== "" ? thankYouMessage : (settings?.thankYouMessage ?? "Thank you for visiting! See you again."),
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetStoreSettingsQueryKey() });
          setShopInfoSaved(true);
          setTimeout(() => setShopInfoSaved(false), 2000);
        },
      }
    );
  };

  const previewReceipt = () => {
    const shopInfo = {
      shopName:          shopName          || settings?.shopName          || "The Waffle Hub",
      shopAddress:       shopAddress       || settings?.shopAddress       || "",
      shopPhone:         shopPhone         || settings?.shopPhone         || "",
      fssaiNumber:       fssaiNumber       || settings?.fssaiNumber       || "",
      gstNumber:         gstNumber         || settings?.gstNumber         || "",
      thankYouMessage:   thankYouMessage   || settings?.thankYouMessage   || "Thank you for visiting! See you again.",
      paperSize:         (settings?.paperSize ?? "80mm") as PaperSize,
      customPaperWidth:  settings?.customPaperWidth  ?? null,
      customPaperHeight: settings?.customPaperHeight ?? null,
    };
    const sampleReceipt = {
      orderNumber: "ORD-SAMPLE",
      orderType: "dine_in",
      customerName: "Sample Customer",
      customerPhone: "+91 98765 43210",
      specialInstructions: "No onions please",
      items: [
        { productName: "Dark & White Fantasy", quantity: 2, price: 90, isAddon: false },
        { productName: "Biscoff Crumble", quantity: 1, price: 60, isAddon: false },
        { productName: "Extra Sauce", quantity: 1, price: 20, isAddon: true },
      ],
      totalAmount: 260,
      cashAmount: 300,
      upiAmount: 0,
      cardAmount: 0,
      discountAmount: 0,
      charityAmount: 2,
      balance: -40,
      cashierName: "Admin",
      createdAt: new Date().toISOString(),
    };
    triggerBrowserPrint(generateReceiptHTML(sampleReceipt, shopInfo), shopInfo.paperSize);
  };

  // Announcements
  const { data: announcements = [], isLoading: annLoading } = useListStoreAnnouncements({
    query: { queryKey: getListStoreAnnouncementsQueryKey() },
  });
  const createAnn = useCreateStoreAnnouncement();
  const updateAnn = useUpdateStoreAnnouncement();
  const deleteAnn = useDeleteStoreAnnouncement();

  const [newMessage, setNewMessage] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editMessage, setEditMessage] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const handleCreateAnn = () => {
    if (!newMessage.trim()) return;
    createAnn.mutate(
      { data: { message: newMessage.trim(), enabled: true } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStoreAnnouncementsQueryKey() });
          setNewMessage("");
        },
      }
    );
  };

  const handleUpdateAnn = (id: number) => {
    updateAnn.mutate(
      { id, data: { message: editMessage.trim() } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStoreAnnouncementsQueryKey() });
          setEditingId(null);
        },
      }
    );
  };

  const handleToggleEnabled = (id: number, enabled: boolean, currentMessage: string) => {
    updateAnn.mutate(
      { id, data: { message: currentMessage, enabled } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getListStoreAnnouncementsQueryKey() }) }
    );
  };

  const handleDeleteAnn = (id: number) => {
    deleteAnn.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStoreAnnouncementsQueryKey() });
          setDeleteConfirmId(null);
        },
      }
    );
  };

  if (settingsLoading) {
    return <div className="flex justify-center py-16"><RefreshCw className="animate-spin text-primary" size={28} /></div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl">

      {/* ── Store Status ──── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Store size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground">Store Status</h2>
        </div>

        {/* Current computed status */}
        <div className={cn(
          "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-semibold",
          settings?.isOpen
            ? "bg-green-500/10 border-green-500/25 text-green-400"
            : "bg-red-500/10 border-red-500/25 text-red-400"
        )}>
          <span className={cn("w-2.5 h-2.5 rounded-full", settings?.isOpen ? "bg-green-400" : "bg-red-400")} />
          {settings?.isOpen ? "🟢 Store is Open" : "🔴 Store is Closed"}
          {settings?.manualOverride && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">(manual override active)</span>
          )}
        </div>

        {/* Manual override buttons */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Manual Override</p>
          <div className="flex gap-2">
            <button
              onClick={() => setManualStatus(true)}
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 rounded-lg text-sm font-semibold transition-colors"
            >
              <ToggleRight size={15} /> Force Open
            </button>
            <button
              onClick={() => setManualStatus(false)}
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg text-sm font-semibold transition-colors"
            >
              <ToggleLeft size={15} /> Force Closed
            </button>
            {settings?.manualOverride && (
              <button
                onClick={clearManualOverride}
                disabled={updateSettings.isPending}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-muted text-muted-foreground border border-border rounded-lg text-sm font-semibold transition-colors"
              >
                <RefreshCw size={14} /> Use Schedule
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Manual override takes priority over the schedule. Click "Use Schedule" to resume automatic timing.
          </p>
        </div>
      </div>

      {/* ── Opening Hours ──── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground">Opening Hours</h2>
        </div>

        <p className="text-xs text-muted-foreground">
          When no manual override is active, the store automatically opens and closes based on these times (IST).
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Opening Time
            </label>
            <input
              type="time"
              value={openTime || loadedOpenTime}
              onChange={e => setOpenTime(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Closing Time
            </label>
            <input
              type="time"
              value={closeTime || loadedCloseTime}
              onChange={e => setCloseTime(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        <button
          onClick={saveTimings}
          disabled={updateSettings.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {timingsSaved
            ? <><Check size={14} /> Saved!</>
            : <><Clock size={14} /> Save Timings</>}
        </button>
      </div>

      {/* ── Contact Information ──── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Phone size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground">Contact Information</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          This number is shown to customers on the order tracking page when their payment is pending, so they can reach you for help.
        </p>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 block">
            Store Contact Number
          </label>
          <input
            type="tel"
            placeholder="e.g. +91 98765 43210"
            value={contactNumber !== "" ? contactNumber : loadedContactNumber}
            onChange={e => setContactNumber(e.target.value)}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={saveContactNumber}
          disabled={updateSettings.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          {contactSaved
            ? <><Check size={14} /> Saved!</>
            : <><Phone size={14} /> Save Contact Number</>}
        </button>
      </div>

      {/* ── Announcements ──── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-primary" />
          <h2 className="font-semibold text-foreground">Announcements</h2>
          <span className="ml-auto text-xs text-muted-foreground">{announcements.length} total</span>
        </div>

        {/* Add new */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">
            New Announcement
          </label>
          <textarea
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            placeholder="e.g. Today's Special: Buy 2 Waffles Get 1 Free"
            rows={2}
            className="w-full bg-secondary border border-border rounded-lg px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <button
            onClick={handleCreateAnn}
            disabled={!newMessage.trim() || createAnn.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Plus size={14} /> Add Announcement
          </button>
        </div>

        {/* List */}
        {annLoading ? (
          <div className="flex justify-center py-4"><RefreshCw className="animate-spin text-muted-foreground" size={18} /></div>
        ) : announcements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No announcements yet</p>
        ) : (
          <div className="space-y-2">
            {announcements.map(ann => (
              <div key={ann.id} className={cn(
                "border rounded-xl px-4 py-3 space-y-2 transition-colors",
                ann.enabled
                  ? "bg-amber-500/5 border-amber-500/25"
                  : "bg-secondary border-border opacity-60"
              )}>
                {editingId === ann.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editMessage}
                      onChange={e => setEditMessage(e.target.value)}
                      rows={2}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateAnn(ann.id)}
                        disabled={updateAnn.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90"
                      >
                        <Check size={12} /> Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-muted-foreground rounded-lg text-xs font-semibold hover:text-foreground"
                      >
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-start gap-2">
                      <Megaphone size={13} className={cn("shrink-0 mt-0.5", ann.enabled ? "text-amber-400" : "text-muted-foreground")} />
                      <p className="text-sm text-foreground flex-1 leading-relaxed">{ann.message}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Enable/disable toggle */}
                      <button
                        onClick={() => handleToggleEnabled(ann.id, !ann.enabled, ann.message)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors",
                          ann.enabled
                            ? "bg-amber-500/15 text-amber-400 border-amber-500/30 hover:bg-amber-500/25"
                            : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                        )}
                      >
                        {ann.enabled
                          ? <><ToggleRight size={12} /> Active</>
                          : <><ToggleLeft size={12} /> Inactive</>}
                      </button>
                      <button
                        onClick={() => { setEditingId(ann.id); setEditMessage(ann.message); }}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-secondary text-muted-foreground border border-border hover:text-foreground transition-colors"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(ann.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 transition-colors ml-auto"
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Printing ──────────────────────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <Printer size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Printing Settings</h2>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          {([
            { key: "receiptPrinting"  as const, label: "Receipt Printing",       desc: "Show print buttons on the Billing page" },
            { key: "kotPrinting"      as const, label: "KOT Printing",            desc: "Show Print KOT button on Kitchen cards" },
            { key: "autoPrint"        as const, label: "Auto-Print KOT",          desc: "Automatically print KOT when an order is placed" },
            { key: "autoPrintReceipt" as const, label: "Auto-Print Receipt",      desc: "Automatically print receipt when payment is collected" },
          ] as const).map(({ key, label, desc }) => {
            const active = !!(settings?.[key]);
            return (
              <div key={key} className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <button
                  onClick={() => togglePrintSetting(key, !active)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors shrink-0",
                    active
                      ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  {active ? <><ToggleRight size={14} /> ON</> : <><ToggleLeft size={14} /> OFF</>}
                </button>
              </div>
            );
          })}
        </div>

        {/* Printer assignment */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Printer Assignment</p>
          <div className="grid grid-cols-1 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Customer Receipt Printer</label>
              <input
                value={receiptPrinterName}
                onChange={e => setReceiptPrinterName(e.target.value)}
                placeholder={settings?.receiptPrinterName || "e.g. Front Desk Printer"}
                className="w-full bg-secondary border border-input rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kitchen KOT Printer</label>
              <input
                value={kotPrinterName}
                onChange={e => setKotPrinterName(e.target.value)}
                placeholder={settings?.kotPrinterName || "e.g. Kitchen Printer"}
                className="w-full bg-secondary border border-input rounded-xl px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <button
            onClick={savePrinterNames}
            disabled={updateSettings.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-muted-foreground border border-border hover:text-foreground text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {printersSaved ? <><Check size={13} /> Saved!</> : <><Printer size={13} /> Save Printer Names</>}
          </button>
        </div>

        {/* Paper size */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Paper Size</p>
          <div className="flex gap-2">
            {(["58mm", "80mm", "A4"] as const).map(size => (
              <button
                key={size}
                onClick={() => savePaperSize(size)}
                className={cn(
                  "flex-1 py-2 rounded-xl text-xs font-bold border transition-colors",
                  (settings?.paperSize ?? "80mm") === size
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                {size}
              </button>
            ))}
            <button
              onClick={() => savePaperSize("custom")}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold border transition-colors",
                (settings?.paperSize ?? "") === "custom"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary text-muted-foreground border-border hover:text-foreground"
              )}
            >
              Custom
            </button>
          </div>
          {(settings?.paperSize ?? "") === "custom" && (
            <div className="bg-secondary/60 border border-border rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Width (mm)</label>
                  <input
                    type="number" min="40" max="250"
                    value={customPaperWidth}
                    onChange={e => setCustomPaperWidth(e.target.value)}
                    placeholder={String(settings?.customPaperWidth ?? 80)}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Height (mm, blank = auto)</label>
                  <input
                    type="number" min="50"
                    value={customPaperHeight}
                    onChange={e => setCustomPaperHeight(e.target.value)}
                    placeholder={settings?.customPaperHeight ? String(settings.customPaperHeight) : "Auto"}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
              <button
                onClick={saveCustomPaper}
                disabled={updateSettings.isPending}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 text-xs font-bold transition-colors hover:bg-primary/25 disabled:opacity-50"
              >
                {customPaperSaved ? <><Check size={12} /> Saved!</> : "Apply Custom Size"}
              </button>
            </div>
          )}
        </div>

        {/* Preview receipt */}
        <button
          onClick={previewReceipt}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-muted-foreground border border-border hover:text-foreground text-xs font-semibold transition-colors"
        >
          <FileText size={13} /> Preview Sample Receipt
        </button>
      </div>

      {/* ── Print History ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <History size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Print History</h2>
          <span className="ml-auto text-xs text-muted-foreground">Last 100 records</span>
        </div>
        {printHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No print records yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-left pb-2 font-semibold">Time</th>
                  <th className="text-left pb-2 font-semibold">Order</th>
                  <th className="text-left pb-2 font-semibold">Type</th>
                  <th className="text-left pb-2 font-semibold">Action</th>
                  <th className="text-left pb-2 font-semibold">Printer</th>
                  <th className="text-left pb-2 font-semibold">By</th>
                  <th className="text-left pb-2 font-semibold">Paper</th>
                </tr>
              </thead>
              <tbody>
                {printHistory.slice(0, 20).map(row => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/50">
                    <td className="py-1.5 pr-3 text-muted-foreground whitespace-nowrap">
                      {new Date(row.printedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })}
                    </td>
                    <td className="py-1.5 pr-3 font-mono text-primary">{row.orderNumber}</td>
                    <td className="py-1.5 pr-3">
                      <span className={cn("px-1.5 py-0.5 rounded font-semibold uppercase", row.type === "receipt" ? "bg-blue-500/10 text-blue-400" : "bg-green-500/10 text-green-400")}>
                        {row.type}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={cn("px-1.5 py-0.5 rounded", row.action === "reprinted" ? "bg-amber-500/10 text-amber-400" : "text-muted-foreground")}>
                        {row.action}
                      </span>
                    </td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.printerName || "—"}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.printedBy}</td>
                    <td className="py-1.5 text-muted-foreground">{row.paperSize}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Shop Info ─────────────────────────────────────────────────────── */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2.5">
          <MapPin size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Shop Info (Printed on Receipts)</h2>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {([
            { key: "shopName",        label: "Shop Name",          placeholder: settings?.shopName        || "The Waffle Hub",          state: shopName,        set: setShopName },
            { key: "shopAddress",     label: "Address",            placeholder: settings?.shopAddress     || "Your shop address…",       state: shopAddress,     set: setShopAddress },
            { key: "shopPhone",       label: "Phone",              placeholder: settings?.shopPhone       || "+91 98765 43210",          state: shopPhone,       set: setShopPhone },
            { key: "fssaiNumber",     label: "FSSAI Number",       placeholder: settings?.fssaiNumber     || "e.g. 12345678901234",      state: fssaiNumber,     set: setFssaiNumber },
            { key: "gstNumber",       label: "GST Number",         placeholder: settings?.gstNumber       || "e.g. 29ABCDE1234F1Z5",     state: gstNumber,       set: setGstNumber },
            { key: "thankYouMessage", label: "Thank-You Message",  placeholder: settings?.thankYouMessage || "Thank you for visiting!",  state: thankYouMessage, set: setThankYouMessage },
          ] as const).map(({ key, label, placeholder, state, set }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">{label}</label>
              <input
                value={state}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-secondary border border-input rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          ))}
        </div>

        <button
          onClick={saveShopInfo}
          disabled={updateSettings.isPending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {shopInfoSaved
            ? <><Check size={14} /> Saved!</>
            : <><MapPin size={14} /> Save Shop Info</>}
        </button>
      </div>

      {/* Delete confirm modal */}
      {deleteConfirmId !== null && (
        <ConfirmModal
          title="Remove Announcement"
          description="This announcement will be permanently deleted and removed from the customer view."
          confirmLabel="Remove"
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={() => handleDeleteAnn(deleteConfirmId)}
        />
      )}
    </div>
  );
}

/* ── Shared Components ──────────────────────────────────────────────────────── */

function MetricCard({ label, value, color = "text-foreground" }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-xl font-bold", color)}>{value}</p>
    </div>
  );
}

/* ── Tables Tab ─────────────────────────────────────────────────────────────── */

const TABLE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  available: { label: "Available", color: "text-green-400 bg-green-500/10 border-green-500/30" },
  occupied:  { label: "Occupied",  color: "text-amber-400 bg-amber-500/10 border-amber-500/30" },
  cleaning:  { label: "Cleaning",  color: "text-blue-400 bg-blue-500/10 border-blue-500/30"   },
};

function TablesTab() {
  const qc = useQueryClient();
  const [count, setCount] = useState("");

  const { data: tables = [], isLoading } = useListTables(
    { query: { queryKey: getListTablesQueryKey() } }
  );
  const configure   = useConfigureTables();
  const updateStatus = useUpdateTableStatus();

  const baseUrl = `${window.location.protocol}//${window.location.host}`;

  const handleConfigure = async () => {
    const n = parseInt(count, 10);
    if (!n || n < 1 || n > 200) return;
    await configure.mutateAsync({ data: { count: n } });
    qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
    setCount("");
  };

  const handleStatus = async (id: number, status: string) => {
    await updateStatus.mutateAsync({ id, data: { status } });
    qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
  };

  const viewQR = (num: number) => {
    const orderUrl = `${baseUrl}/order?table=${num}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(orderUrl)}&margin=10`;
    window.open(qrUrl, "_blank");
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-lg font-bold text-foreground">Table Management</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure tables and generate QR codes for customer self-ordering
        </p>
      </div>

      {/* Configure count */}
      <div className="bg-card border border-card-border rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <LayoutGrid size={15} className="text-primary" />
          Configure Table Count
        </h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1.5 block">Number of tables</label>
            <input
              type="number"
              min={1}
              max={200}
              value={count}
              onChange={e => setCount(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfigure()}
              placeholder={tables.length > 0 ? `Currently ${tables.length} tables` : "e.g. 10"}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleConfigure}
            disabled={configure.isPending || !count}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {configure.isPending
              ? <RefreshCw size={14} className="animate-spin" />
              : <Check size={14} />}
            Apply
          </button>
        </div>
        {tables.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Increasing the count adds new tables; decreasing marks extras inactive.
          </p>
        )}
      </div>

      {/* Tables grid */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw size={20} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading tables…</p>
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-14 text-muted-foreground border border-dashed border-border rounded-xl">
          <LayoutGrid size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No tables configured yet</p>
          <p className="text-xs mt-1 opacity-70">Enter a count above and click Apply to create tables</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map(table => {
            const cfg = TABLE_STATUS_CONFIG[table.status] ?? TABLE_STATUS_CONFIG["available"];
            const orderUrl = `${baseUrl}/order?table=${table.number}`;
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(orderUrl)}&margin=6`;
            return (
              <div key={table.id} className="bg-card border border-card-border rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">Table {table.number}</span>
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", cfg.color)}>
                    {cfg.label}
                  </span>
                </div>

                <div className="flex justify-center">
                  <img
                    src={qrSrc}
                    alt={`QR Table ${table.number}`}
                    className="w-28 h-28 rounded-lg bg-white p-1"
                  />
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(["available", "occupied", "cleaning"] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => handleStatus(table.id, s)}
                      disabled={table.status === s || updateStatus.isPending}
                      className={cn(
                        "text-xs py-1 rounded-lg font-medium transition-colors",
                        table.status === s
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                      )}
                    >
                      {s === "available" ? "Free" : s === "occupied" ? "Busy" : "Clean"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => viewQR(table.number)}
                  className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg py-1.5 transition-colors"
                >
                  <QrCode size={11} />
                  <Download size={11} />
                  View / Save QR
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ title, description, confirmLabel, onCancel, onConfirm }: {
  title: string; description: React.ReactNode; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-card border border-card-border rounded-2xl w-full max-w-sm shadow-2xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-destructive" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">{title}</h3>
            <div className="text-sm text-muted-foreground mt-1">{description}</div>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl bg-secondary text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5">
            <X size={14} /> Cancel
          </button>
          <button onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-destructive text-white text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-1.5">
            <Trash2 size={14} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
