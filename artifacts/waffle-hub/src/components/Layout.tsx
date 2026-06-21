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
  ShieldCheck,
  ClipboardList,
  LogOut,
  Zap,
  Tag,
} from "lucide-react";
import { useState } from "react";
import { useAuth, useRole } from "@/contexts/AuthContext";

type NavItem = { href: string; label: string; icon: React.ElementType };

function buildNav(role: string | null): NavItem[] {
  switch (role) {
    case "admin":
      return [
        { href: "/", label: "Counter", icon: ShoppingBag },
        { href: "/queue", label: "Order Queue", icon: ClipboardList },
        { href: "/kitchen", label: "Kitchen", icon: ChefHat },
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/customers", label: "Customers", icon: Users },
        { href: "/expenses", label: "Expenses", icon: Receipt },
        { href: "/reports", label: "Reports", icon: BarChart3 },
        { href: "/menu", label: "Menu", icon: UtensilsCrossed },
        { href: "/offers", label: "Offers", icon: Tag },
        { href: "/admin", label: "Admin", icon: ShieldCheck },
      ];
    case "counter":
      return [
        { href: "/", label: "Counter", icon: ShoppingBag },
        { href: "/queue", label: "Order Queue", icon: ClipboardList },
        { href: "/expenses", label: "Expenses", icon: Receipt },
      ];
    case "kitchen":
      return [
        { href: "/kitchen", label: "Kitchen", icon: ChefHat },
      ];
    default:
      return [];
  }
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  counter: "Counter",
  kitchen: "Kitchen",
};

const ROLE_COLORS: Record<string, string> = {
  admin: "text-amber-400",
  counter: "text-blue-400",
  kitchen: "text-green-400",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { role } = useRole();

  const navItems = buildNav(role);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navItems.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onClick}
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
    </>
  );

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
          <NavLinks />
        </nav>

        {/* User info + logout */}
        {user && (
          <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
            <div className="px-3 py-2 rounded-md bg-sidebar-accent/30">
              <p className="text-xs font-semibold text-foreground truncate">
                {user.displayName ?? user.username}
              </p>
              <p className={cn("text-xs font-medium", ROLE_COLORS[user.role] ?? "text-muted-foreground")}>
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
            <button
              onClick={() => void handleLogout()}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        )}
      </aside>

      {/* Mobile nav header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-xs">WH</span>
          </div>
          <span className="text-sm font-semibold text-sidebar-foreground">Waffle Hub BCM</span>
          {role === "admin" && <Zap size={12} className="text-amber-400" />}
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
            className="absolute left-0 top-14 bottom-0 w-56 bg-sidebar border-r border-sidebar-border p-3 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              <NavLinks onClick={() => setMobileOpen(false)} />
            </div>
            {user && (
              <div className="pt-3 border-t border-sidebar-border space-y-1">
                <div className="px-3 py-2 rounded-md bg-sidebar-accent/30">
                  <p className="text-xs font-semibold text-foreground truncate">
                    {user.displayName ?? user.username}
                  </p>
                  <p className={cn("text-xs font-medium", ROLE_COLORS[user.role] ?? "text-muted-foreground")}>
                    {ROLE_LABELS[user.role] ?? user.role}
                  </p>
                </div>
                <button
                  onClick={() => void handleLogout()}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            )}
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
