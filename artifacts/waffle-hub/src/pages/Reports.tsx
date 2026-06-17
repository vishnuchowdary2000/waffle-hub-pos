import { useState } from "react";
import {
  useGetDailyReport,
  useGetProductReport,
  getGetDailyReportQueryKey,
  getGetProductReportQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

const PERIODS = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This Week" },
  { key: "monthly", label: "This Month" },
];

export default function Reports() {
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const today = new Date().toISOString().split("T")[0];

  const { data: daily, isLoading: dailyLoading } = useGetDailyReport(
    { date: today },
    { query: { queryKey: getGetDailyReportQueryKey({ date: today }) } }
  );

  const { data: products = [], isLoading: prodLoading } = useGetProductReport(
    { period },
    { query: { queryKey: getGetProductReportQueryKey({ period }) } }
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Reports</h1>
        <p className="text-sm text-muted-foreground">Sales analytics and performance</p>
      </div>

      {/* Daily summary */}
      <div>
        <h2 className="text-base font-bold text-foreground mb-3">Today's Summary</h2>
        {dailyLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="animate-spin text-primary" size={24} />
          </div>
        ) : daily ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricCard label="Total Orders" value={String(daily.totalOrders)} />
              <MetricCard label="Completed" value={String(daily.completedOrders)} color="text-emerald-400" />
              <MetricCard label="Cancelled" value={String(daily.cancelledOrders)} color="text-destructive" />
              <MetricCard label="Avg Order" value={formatCurrency(daily.avgOrderValue)} color="text-primary" />
            </div>

            <div className="bg-card border border-card-border rounded-xl p-5">
              <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Revenue Breakdown</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <RevenueBar label="Cash" amount={daily.cashRevenue} total={daily.totalRevenue + daily.totalCharity} color="bg-emerald-500" />
                <RevenueBar label="UPI / QR" amount={daily.upiRevenue} total={daily.totalRevenue + daily.totalCharity} color="bg-blue-500" />
                <RevenueBar label="Card" amount={daily.cardRevenue} total={daily.totalRevenue + daily.totalCharity} color="bg-purple-500" />
              </div>
              {(daily.totalDiscount > 0 || daily.totalCharity > 0) && (
                <div className="space-y-1.5 mb-4 text-sm">
                  {daily.totalDiscount > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Discounts Given</span>
                      <span className="font-semibold text-emerald-400">−{formatCurrency(daily.totalDiscount)}</span>
                    </div>
                  )}
                  {daily.totalCharity > 0 && (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Charity Collected</span>
                      <span className="font-semibold text-blue-400">+{formatCurrency(daily.totalCharity)}</span>
                    </div>
                  )}
                </div>
              )}
              <div className="border-t border-border pt-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Net Revenue (excl. charity)</span>
                <span className="text-2xl font-bold text-primary">{formatCurrency(daily.totalRevenue)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-destructive/15 rounded-xl flex items-center justify-center">
                  <TrendingDown size={20} className="text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Expenses</p>
                  <p className="text-xl font-bold text-destructive">{formatCurrency(daily.totalExpenses)}</p>
                </div>
              </div>
              <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-500/15 rounded-xl flex items-center justify-center">
                  <TrendingUp size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Est. Profit</p>
                  <p className={cn("text-xl font-bold", daily.estimatedProfit >= 0 ? "text-emerald-400" : "text-destructive")}>
                    {formatCurrency(daily.estimatedProfit)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Best selling products */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Best Selling Products</h2>
          <div className="flex gap-2">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key as typeof period)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  period === p.key ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {prodLoading ? (
          <div className="flex justify-center py-8">
            <RefreshCw className="animate-spin text-primary" size={24} />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No sales data yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.slice(0, 10).map((p, idx) => {
              const maxQty = products[0]?.totalQuantity ?? 1;
              const pct = Math.round((p.totalQuantity / maxQty) * 100);
              return (
                <div key={p.productName} className="bg-card border border-card-border rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-4 mb-2">
                    <span className="text-2xl font-bold text-muted-foreground/40 w-6">#{idx + 1}</span>
                    <span className="flex-1 font-semibold text-sm text-foreground">{p.productName}</span>
                    <span className="text-sm text-muted-foreground">{p.totalQuantity} sold</span>
                    <span className="font-bold text-primary text-sm">{formatCurrency(p.totalRevenue)}</span>
                  </div>
                  <div className="ml-10 bg-border rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-card border border-card-border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={cn("text-2xl font-bold", color ?? "text-foreground")}>{value}</p>
    </div>
  );
}

function RevenueBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((amount / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{formatCurrency(amount)}</span>
      </div>
      <div className="bg-border rounded-full h-2 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
    </div>
  );
}
