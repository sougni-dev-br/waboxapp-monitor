import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { useEffect, useRef } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Monitor from "./pages/Monitor";
import Login from "./pages/Login";
import { trpc } from "./lib/trpc";

// Renova o cookie de sessão silenciosamente a cada 7 dias
function SessionRefresher({ isAuthed }: { isAuthed: boolean }) {
  const refreshMutation = trpc.auth.refresh.useMutation();
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isAuthed) return;

    // Renova imediatamente ao montar (garante que sessões antigas sejam atualizadas)
    refreshMutation.mutate();
    lastRefreshRef.current = Date.now();

    // Verifica a cada hora se já passou 7 dias desde o último refresh
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    const interval = setInterval(() => {
      if (Date.now() - lastRefreshRef.current >= SEVEN_DAYS_MS) {
        refreshMutation.mutate();
        lastRefreshRef.current = Date.now();
      }
    }, 60 * 60 * 1000); // verifica a cada 1 hora

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed]);

  return null;
}

function Router() {
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
          <p className="text-xs text-gray-400">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SessionRefresher isAuthed={!!user} />
      <Switch>
        <Route path="/" component={user ? Monitor : Login} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
