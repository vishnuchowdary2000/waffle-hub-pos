import { useState, useMemo } from "react";
import { useRole } from "@/contexts/AuthContext";
import {
  useGetReportRange,
  getGetReportRangeQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldX,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

type FilterMode = "today" | "date" | "range" | "monthly" | "last6" | "last12";

const FILTER_MODES: { key: FilterMode; label: string }[] = [
  { key: "today",   label: "Today" },
  { key: "date",    label: "Particular Date" },
  { key: "range",   label: "Date Range" },
  { key: "monthly", label: "Monthly" },
  { key: "last6",   label: "Last 6 Months" },
  { key: "last12",  label: "Last 12 Months" },
];

function todayStr() {
  return new Date().toISOString().split("T")[0];
}
function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Reports() {
  const { role } = useRole();

  const [filterMode, setFilterMode] = useState<FilterMode>("today");
  const [selectedDate, setSelectedDate]   = useState(todayStr());
  const [fromDate, setFromDate]           = useState(todayStr());
  const [toDate, setToDate]               = useState(todayStr());
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr());

  const { from, to } = useMemo(() => {
    const today = todayStr();
    switch (filterMode) {
      case "today":
        return { from: today, to: today };
      case "date":
        return { from: selectedDate, to: selectedDate };
      case "range":
        return { from: fromDate, to: toDate };
      case "monthly": {
        const [year, month] = selectedMonth.split("-").map(Number);
        const lastDay = new Date(year, month, 0).getDate();
        return {
          from: `${selectedMonth}-01`,
          to:   `${selectedMonth}-${String(lastDay).padStart(2, "0")}`,
        };
      }
      case "last6": {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        return { from: d.toISOString().split("T")[0], to: today };
      }
      case "last12": {
        const d = new Date();
        d.setMonth(d.getMonth() - 12);
        return { from: d.toISOString().split("T")[0], to: today };
      }
    }
  }, [filterMode, selectedDate, fromDate, toDate, selectedMonth]);

  const { data: report, isLoading, refetch } = useGetReportRange(
    { from, to },
    { query: { queryKey: getGetReportRangeQueryKey({ from, to }) } }
  );

  if (role && role !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <ShieldX size={48} className="text-muted-foreground opacity-50" />
        <p className="text-muted-foreground text-sm">You don't have permission to view reports.</p>
      </div>
    );
  }

  const exportCSV = () => {
    if (!report) return;
    const rows: string[][] = [
      [`Report: ${from} to ${to}`],
      [],
      ["METRICS"],
      ["Total Orders",     String(report.totalOrders)],
      ["Completed Orders", String(report.completedOrders)],
      ["Pending Orders",   String(report.pendingOrders)],
      ["Cancelled Orders", String(report.cancelledOrders)],
      ["Revenue",          report.totalRevenue.toFixed(2)],
      ["Expenses",         report.totalExpenses.toFixed(2)],
      ["Net Revenue",      report.netRevenue.toFixed(2)],
      ["Avg Order Value",  report.avgOrderValue.toFixed(2)],
      ["Cash Revenue",     report.cashRevenue.toFixed(2)],
      ["UPI Revenue",      report.upiRevenue.toFixed(2)],
      ["Card Revenue",     report.cardRevenue.toFixed(2)],
      [],
      ["ORDER BREAKDOWN"],
      ["Dine In",    String(report.dineInOrders)],
      ["Takeaway",   String(report.takeawayOrders)],
      ["Other",      String(report.mixedOrders)],
      [],
      ["TOP 10 PRODUCTS"],
      ["Rank", "Product", "Qty Sold", "Revenue"],
      ...report.topProducts.map((p, i) => [String(i + 1), p.productName, String(p.totalQuantity), p.totalRevenue.toFixed(2)]),
      [],
      ["CATEGORY PERFORMANCE"],
      ["Category", "Orders", "Qty Sold", "Revenue"],
      ...report.categories.map(c => [c.categoryName, String(c.orders), String(c.quantity), c.revenue.toFixed(2)]),
    ];
    const csv = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `report-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (!report) return;
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Metric", "Value"],
      ["Period", `${from} to ${to}`],
      ["Total Orders",     report.totalOrders],
      ["Completed Orders", report.completedOrders],
      ["Pending Orders",   report.pendingOrders],
      ["Cancelled Orders", report.cancelledOrders],
      ["Revenue (₹)",      report.totalRevenue],
      ["Expenses (₹)",     report.totalExpenses],
      ["Net Revenue (₹)",  report.netRevenue],
      ["Avg Order Value (₹)", report.avgOrderValue],
      ["Cash Revenue (₹)", report.cashRevenue],
      ["UPI Revenue (₹)",  report.upiRevenue],
      ["Card Revenue (₹)", report.cardRevenue],
      ["Total Discount (₹)", report.totalDiscount],
      ["Total Charity (₹)",  report.totalCharity],
      [],
      ["ORDER BREAKDOWN"],
      ["Dine In Orders",  report.dineInOrders],
      ["Takeaway Orders", report.takeawayOrders],
      ["Other Orders",    report.mixedOrders],
    ]), "Summary");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Rank", "Product", "Qty Sold", "Revenue (₹)"],
      ...report.topProducts.map((p, i) => [i + 1, p.productName, p.totalQuantity, p.totalRevenue]),
    ]), "Top Products");

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["Category", "Orders", "Qty Sold", "Revenue (₹)"],
      ...report.categories
        .sort((a, b) => b.revenue - a.revenue)
        .map(c => [c.categoryName, c.orders, c.quantity, c.revenue]),
    ]), "Category Performance");

    XLSX.writeFile(wb, `report-${from}-${to}.xlsx`);
  };

  const periodLabel = from === to ? from : `${from} → ${to}`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reports</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-secondary hover:bg-muted text-muted-foreground transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={exportCSV}
            disabled={!report || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary hover:bg-muted text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={exportExcel}
            disabled={!report || isLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-sm font-medium text-emerald-400 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={14} /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter mode tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTER_MODES.map(m => (
          <button
            key={m.key}
            onClick={() => setFilterMode(m.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              filterMode === m.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Filter-specific inputs */}
      {filterMode === "date" && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Select Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}
      {filterMode === "range" && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">From:</label>
            <input
              type="date"
              value={fromDate}
              onChange={e => setFromDate(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">To:</label>
            <input
              type="date"
              value={toDate}
              onChange={e => setToDate(e.target.value)}
              className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      )}
      {filterMode === "monthly" && (
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Select Month:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <RefreshCw className="animate-spin text-primary" size={28} />
        </div>
      )}

      {/* Report content */}
      {!isLoading && report && (
        <>
          {/* ── Metrics ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Total Orders"     value={String(report.totalOrders)} />
            <MetricCard label="Completed"        value={String(report.completedOrders)} color="text-emerald-400" />
            <MetricCard label="Pending"          value={String(report.pendingOrders)}   color="text-amber-400" />
            <MetricCard label="Cancelled"        value={String(report.cancelledOrders)} color="text-destructive" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Revenue"          value={formatCurrency(report.totalRevenue)} color="text-primary" />
            <MetricCard label="Expenses"         value={formatCurrency(report.totalExpenses)} color="text-destructive" />
            <MetricCard label="Net Revenue"      value={formatCurrency(report.netRevenue)}
              color={report.netRevenue >= 0 ? "text-emerald-400" : "text-destructive"} />
            <MetricCard label="Avg Order Value"  value={formatCurrency(report.avgOrderValue)} color="text-blue-400" />
          </div>

          {/* ── Revenue Breakdown ── */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Revenue Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
              <RevenueBar label="Cash"     amount={report.cashRevenue} total={report.totalRevenue} color="bg-emerald-500" />
              <RevenueBar label="UPI / QR" amount={report.upiRevenue}  total={report.totalRevenue} color="bg-blue-500" />
              <RevenueBar label="Card"     amount={report.cardRevenue} total={report.totalRevenue} color="bg-purple-500" />
            </div>
            <div className="flex flex-wrap gap-4 pt-3 border-t border-border">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Total Revenue</span>
                <span className="font-bold text-primary text-lg">{formatCurrency(report.totalRevenue)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Expenses</span>
                <span className="font-bold text-destructive text-lg">{formatCurrency(report.totalExpenses)}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Net Revenue</span>
                <span className={cn("font-bold text-lg", report.netRevenue >= 0 ? "text-emerald-400" : "text-destructive")}>
                  {formatCurrency(report.netRevenue)}
                </span>
              </div>
              {report.totalDiscount > 0 && (
                <div className="flex flex-col">
                  <span className="text-xs text-muted-foreground">Discounts</span>
                  <span className="font-bold text-muted-foreground">{formatCurrency(report.totalDiscount)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Order Breakdown ── */}
          <div className="bg-card border border-card-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-muted-foreground mb-4 uppercase tracking-wide">Order Breakdown</h3>
            <div className="grid grid-cols-3 gap-4">
              <BreakdownCard label="Dine In"   value={report.dineInOrders}   total={report.totalOrders} color="bg-orange-500"  textColor="text-orange-400" />
              <BreakdownCard label="Takeaway"  value={report.takeawayOrders} total={report.totalOrders} color="bg-blue-500"    textColor="text-blue-400" />
              <BreakdownCard label="Other"     value={report.mixedOrders}    total={report.totalOrders} color="bg-violet-500"  textColor="text-violet-400" />
            </div>
          </div>

          {/* ── Top 10 Selling Items ── */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Top 10 Selling Items</h2>
            {report.topProducts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No sales data for this period</p>
              </div>
            ) : (
              <div className="space-y-2">
                {report.topProducts.map((p, idx) => {
                  const maxQty = report.topProducts[0]?.totalQuantity ?? 1;
                  const pct = Math.round((p.totalQuantity / maxQty) * 100);
                  return (
                    <div key={p.productName} className="bg-card border border-card-border rounded-xl px-4 py-3.5">
                      <div className="flex items-center gap-4 mb-2">
                        <span className="text-2xl font-bold text-muted-foreground/40 w-6 shrink-0">#{idx + 1}</span>
                        <span className="flex-1 font-semibold text-sm text-foreground">{p.productName}</span>
                        <span className="text-sm text-muted-foreground shrink-0">{p.totalQuantity} sold</span>
                        <span className="font-bold text-primary text-sm shrink-0">{formatCurrency(p.totalRevenue)}</span>
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

          {/* ── Category Performance ── */}
          <div>
            <h2 className="text-base font-bold text-foreground mb-3">Category Performance</h2>
            {report.categories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No category data for this period</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[...report.categories]
                  .sort((a, b) => b.revenue - a.revenue)
                  .map(cat => {
                    const maxRev = report.categories.reduce((m, c) => Math.max(m, c.revenue), 0);
                    const pct = maxRev > 0 ? Math.round((cat.revenue / maxRev) * 100) : 0;
                    return (
                      <div key={cat.categoryName} className="bg-card border border-card-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-semibold text-sm text-foreground">{cat.categoryName}</span>
                          <span className="font-bold text-primary text-sm">{formatCurrency(cat.revenue)}</span>
                        </div>
                        <div className="bg-border rounded-full h-1.5 overflow-hidden mb-2">
                          <div className="h-full bg-primary/70 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{cat.orders} orders</span>
                          <span>{cat.quantity} items sold</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* ── Summary ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4">
            <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 bg-destructive/15 rounded-xl flex items-center justify-center">
                <TrendingDown size={20} className="text-destructive" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold text-destructive">{formatCurrency(report.totalExpenses)}</p>
              </div>
            </div>
            <div className="bg-card border border-card-border rounded-xl p-4 flex items-center gap-4">
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", report.netRevenue >= 0 ? "bg-emerald-500/15" : "bg-destructive/15")}>
                <TrendingUp size={20} className={report.netRevenue >= 0 ? "text-emerald-400" : "text-destructive"} />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Est. Profit (Net)</p>
                <p className={cn("text-xl font-bold", report.netRevenue >= 0 ? "text-emerald-400" : "text-destructive")}>
                  {formatCurrency(report.netRevenue)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

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

function BreakdownCard({ label, value, total, color, textColor }: {
  label: string; value: number; total: number; color: string; textColor: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="bg-secondary rounded-xl p-4 text-center">
      <p className={cn("text-3xl font-bold mb-1", textColor)}>{value}</p>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <div className="bg-border rounded-full h-1.5 overflow-hidden">
        <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground mt-1">{pct}%</p>
    </div>
  );
}
