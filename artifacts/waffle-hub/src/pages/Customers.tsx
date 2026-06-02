import { useState } from "react";
import {
  useListCustomers,
  useGetCustomer,
  useListOrders,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Search, User, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: customers = [], isLoading } = useListCustomers(
    { search: search || undefined },
    { query: { queryKey: getListCustomersQueryKey({ search: search || undefined }) } }
  );

  const { data: selectedCustomer } = useGetCustomer(selectedId!, {
    query: { enabled: !!selectedId },
  });

  const { data: customerOrders = [] } = useListOrders(
    { search: selectedCustomer?.phone },
    { query: { enabled: !!selectedCustomer?.phone } }
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* List panel */}
      <div className={cn("flex flex-col w-full md:w-80 lg:w-96 border-r border-border shrink-0", selectedId && "hidden md:flex")}>
        <div className="p-4 border-b border-border space-y-3">
          <h1 className="text-xl font-bold text-foreground">Customers</h1>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-secondary border border-border rounded-lg pl-8 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <p className="text-xs text-muted-foreground">{customers.length} customers</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {isLoading ? (
            <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">No customers found</div>
          ) : (
            customers.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-secondary/50 transition-colors",
                  selectedId === c.id && "bg-primary/10 border-r-2 border-primary"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <span className="text-primary font-bold text-sm">{c.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.phone}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{formatCurrency(c.totalSpending)}</p>
                  <p className="text-xs text-muted-foreground">{c.orderCount} orders</p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selectedId ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <button onClick={() => setSelectedId(null)} className="md:hidden text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
            <h2 className="font-bold text-foreground">{selectedCustomer?.name ?? "Loading..."}</h2>
          </div>

          {selectedCustomer && (
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Profile card */}
              <div className="bg-card border border-card-border rounded-xl p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-bold text-xl">{selectedCustomer.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{selectedCustomer.name}</h3>
                    <p className="text-muted-foreground">{selectedCustomer.phone}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-border pt-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{selectedCustomer.orderCount}</p>
                    <p className="text-xs text-muted-foreground">Orders</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-primary">{formatCurrency(selectedCustomer.totalSpending)}</p>
                    <p className="text-xs text-muted-foreground">Total Spent</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">
                      {selectedCustomer.lastOrderDate ? formatDate(selectedCustomer.lastOrderDate) : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">Last Order</p>
                  </div>
                </div>
                {selectedCustomer.favoriteItems && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Recent items</p>
                    <p className="text-sm text-foreground">{selectedCustomer.favoriteItems}</p>
                  </div>
                )}
              </div>

              {/* Order history */}
              <div>
                <h3 className="text-base font-bold text-foreground mb-3">Order History</h3>
                <div className="space-y-2">
                  {customerOrders.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No orders found</p>
                  ) : (
                    customerOrders.slice(0, 10).map(order => (
                      <div key={order.id} className="bg-card border border-card-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
                          <span className="text-sm font-bold text-primary">{formatCurrency(order.totalAmount)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {order.items.map(i => `${i.productName} x${i.quantity}`).join(", ")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDate(order.createdAt)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <User size={40} className="mx-auto mb-3 opacity-30" />
            <p>Select a customer to view details</p>
          </div>
        </div>
      )}
    </div>
  );
}
