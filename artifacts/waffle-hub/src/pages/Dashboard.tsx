import { useGetDashboard, useListOrders, useUpdateOrderStatus, getGetDashboardQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatTime, STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { RefreshCw, TrendingUp, ShoppingBag, Clock, CheckCircle, XCircle, Search } from "lucide-react";
import { useState } from "react";

const statusClass: Record<string, string> = {
  pending: "status-pending",
  preparing: "status-preparing",
  ready: "status-ready",
  completed: "status-completed",
  cancelled: "status-cancelled",
};

export default function Dashboard() {
  const qc = useQueryClient();
  const { data, isLoading } = useGetDashboard(undefined, { query: { refetchInterval: 3000 } });
  const [search, setSearch] = useState("");
  const { data: searchResults } = useListOrders(
    { search },
    { query: { enabled: search.length > 0, refetchInterval: 3000 } }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  const summary = data;
  const displayOrders = search.length > 0 ? (searchResults ?? []) : (summary?.recentOrders ?? []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live order overview</p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() })}
          className="p-2 rounded-lg bg-secondary hover:bg-muted text-muted-foreground"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Pending"
          value={summary?.pendingCount ?? 0}
          color="text-amber-400"
          bgColor="bg-amber-500/10"
          icon={<Clock size={18} className="text-amber-400" />}
        />
        <StatCard
          label="Preparing"
          value={summary?.preparingCount ?? 0}
          color="text-blue-400"
          bgColor="bg-blue-500/10"
          icon={<ShoppingBag size={18} className="text-blue-400" />}
        />
        <StatCard
          label="Ready"
          value={summary?.readyCount ?? 0}
          color="text-green-400"
          bgColor="bg-green-500/10"
          icon={<CheckCircle size={18} className="text-green-400" />}
        />
        <StatCard
          label="Done Today"
          value={summary?.completedToday ?? 0}
          color="text-emerald-400"
          bgColor="bg-emerald-500/10"
          icon={<TrendingUp size={18} className="text-emerald-400" />}
        />
      </div>

      {/* Revenue row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="col-span-1 md:col-span-2 bg-card border border-card-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Today's Revenue</p>
          <p className="text-3xl font-bold text-primary">{formatCurrency(summary?.todayRevenue ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{summary?.todayOrders ?? 0} total orders</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground mb-1">Expenses</p>
          <p className="text-2xl font-bold text-destructive">{formatCurrency(summary?.todayExpenses ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Today</p>
        </div>
      </div>

      {/* Search + recent orders */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold flex-1">Recent Orders</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-secondary border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-48"
            />
          </div>
        </div>

        <div className="space-y-2">
          {displayOrders.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">No orders yet today</div>
          )}
          {displayOrders.slice(0, 15).map(order => (
            <div key={order.id} className="bg-card border border-card-border rounded-xl px-4 py-3 flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusClass[order.status])}>
                    {STATUS_LABELS[order.status]}
                  </span>
                  <span className="text-xs text-muted-foreground">{ORDER_TYPE_LABELS[order.orderType] ?? order.orderType}</span>
                </div>
                <p className="font-semibold text-sm mt-0.5">{order.customerName}</p>
                <p className="text-xs text-muted-foreground">
                  {order.items.map(i => `${i.productName} x${i.quantity}`).join(", ")}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-sm text-primary">{formatCurrency(order.totalAmount)}</p>
                <p className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</p>
              </div>
              {(order.status === "pending" || order.status === "preparing" || order.status === "ready") && (
                <Link href={`/billing/${order.id}`} className="shrink-0 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90">
                  Bill
                </Link>
              )}
            </div>
          ))}
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
      <div className="flex items-center justify-between mb-2">
        {icon}
      </div>
      <p className={cn("text-3xl font-bold", color)}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}
