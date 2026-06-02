import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ShoppingBag,
  ChefHat,
  Users,
  Receipt,
  BarChart3,
  UtensilsCrossed,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";

const NAV_ITEMS = [
  { href: "/", label: "Counter", icon: ShoppingBag },
  { href: "/kitchen", label: "Kitchen", icon: ChefHat },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/customers", label: "Customers", icon: Users },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/menu", label: "Menu", icon: UtensilsCrossed },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 bg-sidebar border-r border-sidebar-border shrink-0">
        <div className="px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">WH</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-sidebar-foreground leading-tight">Waffle Hub</p>
              <p className="text-xs text-muted-foreground leading-tight">BCM</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                location === href
                  ? "bg-primary/20 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon size={16} className="shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border">
          <p className="text-xs text-muted-foreground">The Waffle Hub BCM</p>
        </div>
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">WH</span>
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">Waffle Hub BCM</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-sidebar-foreground p-1"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setMobileOpen(false)}>
          <nav
            className="absolute left-0 top-14 bottom-0 w-56 bg-sidebar border-r border-sidebar-border p-3 space-y-0.5 overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium",
                  location === href
                    ? "bg-primary/20 text-primary"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto md:pt-0 pt-14">
        {children}
      </main>
    </div>
  );
}
