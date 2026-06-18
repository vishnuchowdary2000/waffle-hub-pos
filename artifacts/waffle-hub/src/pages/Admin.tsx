import { useState } from "react";
import {
  useListCustomers,
  useDeleteCustomer,
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
  getListCustomersQueryKey,
  getListExpensesQueryKey,
  getGetDailyReportQueryKey,
  getGetProductReportQueryKey,
  getListUsersQueryKey,
  getGetStoreSettingsQueryKey,
  getListStoreAnnouncementsQueryKey,
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
  Store, Megaphone, Clock, Check, Pencil,
} from "lucide-react";

type Tab = "customers" | "expenses" | "reports" | "users" | "store";

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

  const { data: customers = [], isLoading } = useListCustomers(
    { search: search || undefined },
    { query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) } }
  );
  const deleteCustomer = useDeleteCustomer();

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

  // Sync local time inputs when settings load
  const loadedOpenTime = settings?.openTime ?? "";
  const loadedCloseTime = settings?.closeTime ?? "";

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
