import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WelcomeGate } from "@/components/WelcomeGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initAnalytics } from "@/lib/analytics";
import { BetaFooter } from "@/components/BetaFooter";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Game from "@/pages/Game";
import BadugiGame from "@/pages/BadugiGame";
import Dead7Game from "@/pages/Dead7Game";
import Fifteen35Game from "@/pages/Fifteen35Game";
import SuitsPokerGame from "@/pages/SuitsPokerGame";
import Admin from "@/pages/Admin";
import Terms from "@/pages/Terms";

function Router() {
  return (
    <ErrorBoundary>
      <Switch>
        <Route path="/" component={Home}/>
        <Route path="/swing" component={Game}/>
        <Route path="/badugi" component={BadugiGame}/>
        <Route path="/dead7" component={Dead7Game}/>
        <Route path="/fifteen35" component={Fifteen35Game}/>
        <Route path="/suitspoker" component={SuitsPokerGame}/>
        <Route path="/admin" component={Admin}/>
        <Route path="/terms" component={Terms}/>
        <Route component={NotFound} />
      </Switch>
    </ErrorBoundary>
  );
}

function App() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <WelcomeGate>
          <Router />
          <BetaFooter />
        </WelcomeGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
