import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Counter from "@/pages/Counter";
import Kitchen from "@/pages/Kitchen";
import Dashboard from "@/pages/Dashboard";
import Billing from "@/pages/Billing";
import Customers from "@/pages/Customers";
import Expenses from "@/pages/Expenses";
import Reports from "@/pages/Reports";
import MenuManager from "@/pages/MenuManager";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Queue from "@/pages/Queue";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

const ROLE_HOME: Record<string, string> = {
  admin: "/dashboard",
  counter: "/",
  kitchen: "/kitchen",
};

function Spinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-muted-foreground mb-2">404</h1>
        <p className="text-muted-foreground">Page not found</p>
      </div>
    </div>
  );
}

function ProtectedRoute({
  component: Component,
  roles,
}: {
  component: React.ComponentType;
  roles?: string[];
}) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigate("/login");
      return;
    }
    if (roles && !roles.includes(user.role)) {
      navigate(ROLE_HOME[user.role] ?? "/");
    }
  }, [isLoading, user, roles, navigate]);

  if (isLoading) return <Spinner />;
  if (!user) return <Spinner />;
  if (roles && !roles.includes(user.role)) return <Spinner />;
  return <Component />;
}

function LoginRoute() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      navigate(ROLE_HOME[user.role] ?? "/");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) return <Spinner />;
  if (user) return <Spinner />;
  return <Login />;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/login" component={LoginRoute} />

        <Route path="/">
          {() => <ProtectedRoute component={Counter} roles={["admin", "counter"]} />}
        </Route>
        <Route path="/queue">
          {() => <ProtectedRoute component={Queue} roles={["admin", "counter"]} />}
        </Route>
        <Route path="/billing/:id">
          {() => <ProtectedRoute component={Billing} roles={["admin", "counter"]} />}
        </Route>
        <Route path="/expenses">
          {() => <ProtectedRoute component={Expenses} roles={["admin", "counter"]} />}
        </Route>

        <Route path="/kitchen">
          {() => <ProtectedRoute component={Kitchen} roles={["admin", "counter", "kitchen"]} />}
        </Route>

        <Route path="/dashboard">
          {() => <ProtectedRoute component={Dashboard} roles={["admin"]} />}
        </Route>
        <Route path="/customers">
          {() => <ProtectedRoute component={Customers} roles={["admin"]} />}
        </Route>
        <Route path="/reports">
          {() => <ProtectedRoute component={Reports} roles={["admin"]} />}
        </Route>
        <Route path="/menu">
          {() => <ProtectedRoute component={MenuManager} roles={["admin"]} />}
        </Route>
        <Route path="/admin">
          {() => <ProtectedRoute component={Admin} roles={["admin"]} />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
