import { Switch, Route, Router as WouterRouter } from "wouter";
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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

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

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Counter} />
        <Route path="/kitchen" component={Kitchen} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/billing/:id" component={Billing} />
        <Route path="/customers" component={Customers} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/reports" component={Reports} />
        <Route path="/menu" component={MenuManager} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
